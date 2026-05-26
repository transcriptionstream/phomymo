"""
Analyze an Android BT HCI snoop log (.log / .btsnoop) to extract:
  - Negotiated ATT MTU
  - ATT write sizes (chunk sizes sent to the printer)
  - Inter-write timing and effective data rate

Usage:
    python tools/analyze_btsnoop.py <path-to-btsnoop.log>

The btsnoop file is typically at:
    /data/misc/bluetooth/logs/btsnoop_hci.log   (Android, requires root or bug report)
    Or pull via: adb bugreport -> unzip -> find btsnoop_hci.log
"""

import sys
import struct
import datetime

BTSNOOP_MAGIC = b'btsnoop\x00'
HCI_ACL = 0x02
L2CAP_ATT_CID = 0x0004

ATT_EXCHANGE_MTU_REQ = 0x02
ATT_EXCHANGE_MTU_RSP = 0x03
ATT_WRITE_REQ        = 0x12  # writeValue (with response)
ATT_WRITE_CMD        = 0x52  # writeValueWithoutResponse
ATT_WRITE_RSP        = 0x13

# btsnoop epoch: Jan 1, 0000 00:00:00 UTC (microseconds)
BTSNOOP_EPOCH_OFFSET_US = 0x00dcddb30f2f8000  # offset to Unix epoch


def parse_btsnoop(path):
    with open(path, 'rb') as f:
        magic = f.read(8)
        if magic != BTSNOOP_MAGIC:
            sys.exit('Not a btsnoop file (wrong magic bytes)')
        version, datalink = struct.unpack('>II', f.read(8))
        print(f'btsnoop version={version} datalink={datalink}')

        records = []
        while True:
            hdr = f.read(24)
            if len(hdr) < 24:
                break
            orig_len, incl_len, flags, drops, ts_us = struct.unpack('>IIII q', hdr)
            data = f.read(incl_len)
            # Convert btsnoop timestamp to Unix microseconds
            unix_us = ts_us - BTSNOOP_EPOCH_OFFSET_US
            records.append((unix_us, flags, orig_len, data))

    return records


def parse_att(data):
    """Parse HCI ACL → L2CAP → ATT. Returns (opcode, handle, payload_len, preview) or None.

    Large ATT writes are split across multiple HCI ACL fragments. We only process the
    first fragment (PB flag != 0x01) and read the *total* ATT PDU length from the L2CAP
    header — that gives the real write size without needing to reassemble all fragments.
    """
    if len(data) < 9:
        return None
    pkt_type = data[0]
    if pkt_type != HCI_ACL:
        return None
    # ACL header word: [15:12] BC flag, [13:12] PB flag, [11:0] connection handle
    handle_flags = struct.unpack_from('<H', data, 1)[0]
    pb_flag = (handle_flags >> 12) & 0x3
    if pb_flag == 0x01:  # continuation fragment — skip, we already counted from first frag
        return None
    # L2CAP header: length (2B, total ATT PDU size) + CID (2B)
    l2cap_len, cid = struct.unpack_from('<HH', data, 5)
    if cid != L2CAP_ATT_CID:
        return None
    att = data[9:]  # ATT bytes present in this (first) fragment
    if not att:
        return None
    opcode = att[0]
    if opcode in (ATT_WRITE_REQ, ATT_WRITE_CMD):
        if len(att) < 3:
            return None
        handle = struct.unpack_from('<H', att, 1)[0]
        # l2cap_len = full ATT PDU = opcode(1) + handle(2) + payload
        actual_payload_len = max(0, l2cap_len - 3)
        preview = att[3:3+16].hex() if len(att) > 3 else ''
        return (opcode, handle, actual_payload_len, preview)
    if opcode in (ATT_EXCHANGE_MTU_REQ, ATT_EXCHANGE_MTU_RSP):
        if len(att) >= 3:
            mtu = struct.unpack_from('<H', att, 1)[0]
            return (opcode, 0, mtu, '')
    return None


def analyze(path):
    records = parse_btsnoop(path)
    print(f'Total HCI records: {len(records)}\n')

    mtu_negotiated = None
    write_events = []  # (unix_us, handle, payload_len, first_16_bytes_hex)

    for unix_us, flags, orig_len, data in records:
        parsed = parse_att(data)
        if parsed is None:
            continue
        opcode, handle, payload_len, preview = parsed

        if opcode == ATT_EXCHANGE_MTU_REQ:
            print(f'ATT MTU Request  → client wants MTU={payload_len}')
        elif opcode == ATT_EXCHANGE_MTU_RSP:
            mtu_negotiated = payload_len
            print(f'ATT MTU Response → server offers MTU={payload_len}  (effective payload per write: {payload_len - 3} bytes)')
        elif opcode in (ATT_WRITE_REQ, ATT_WRITE_CMD):
            kind = 'WriteReq' if opcode == ATT_WRITE_REQ else 'WriteCmd'
            write_events.append((unix_us, handle, payload_len, kind, preview))

    if not write_events:
        print('\nNo ATT write operations found. Check that this log covers the print session.')
        return

    print(f'\n--- ATT Write Operations ({len(write_events)} total) ---')

    # Group by handle to separate printer data writes from setup commands
    handles = {}
    for ev in write_events:
        handles.setdefault(ev[1], []).append(ev)

    for handle, evs in sorted(handles.items()):
        sizes = [e[2] for e in evs]
        unique_sizes = sorted(set(sizes))
        total_bytes = sum(sizes)
        print(f'\nHandle 0x{handle:04x}: {len(evs)} writes, sizes={unique_sizes}, total={total_bytes} bytes')

        if len(evs) > 1:
            intervals_us = [evs[i+1][0] - evs[i][0] for i in range(len(evs)-1)]
            intervals_ms = [iv / 1000 for iv in intervals_us]
            avg_interval = sum(intervals_ms) / len(intervals_ms)
            min_interval = min(intervals_ms)
            max_interval = max(intervals_ms)
            duration_s = (evs[-1][0] - evs[0][0]) / 1_000_000
            throughput = total_bytes / duration_s if duration_s > 0 else 0
            print(f'  Inter-write interval: avg={avg_interval:.1f}ms  min={min_interval:.1f}ms  max={max_interval:.1f}ms')
            print(f'  Duration: {duration_s:.2f}s  Throughput: {throughput:.0f} bytes/s  ({throughput*8/1000:.1f} kbit/s)')

        print(f'  First few writes:')
        for ev in evs[:8]:
            ts = datetime.datetime.fromtimestamp(ev[0] / 1_000_000, tz=datetime.timezone.utc)
            print(f'    [{ts.strftime("%H:%M:%S.%f")}] {ev[3]} handle=0x{ev[1]:04x} len={ev[2]:4d}  data={ev[4]}...')
        if len(evs) > 8:
            print(f'    ... ({len(evs) - 8} more)')

    print('\n--- Summary ---')
    if mtu_negotiated:
        print(f'Negotiated ATT MTU : {mtu_negotiated} bytes')
        print(f'Max safe write size: {mtu_negotiated - 3} bytes (ATT header = 3 bytes)')
    else:
        print('ATT MTU exchange not found in this capture (may have been captured mid-session)')

    data_handle_candidates = [(h, evs) for h, evs in handles.items() if max(e[2] for e in evs) > 10]
    if data_handle_candidates:
        h, evs = max(data_handle_candidates, key=lambda x: sum(e[2] for e in x[1]))
        sizes = [e[2] for e in evs]
        print(f'Most likely data handle: 0x{h:04x}')
        print(f'Chunk sizes used      : {sorted(set(sizes))}')
        print(f'Dominant chunk size   : {max(set(sizes), key=sizes.count)} bytes')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)
    analyze(sys.argv[1])
