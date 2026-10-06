import xlwt, datetime, sys, struct
from xlwt import Cell, BIFFRecords
out = sys.argv[1]

# xlwt always writes an "empty" cached formula result; patch in real cached values like Excel stores them
CACHED = {}
class _Raw(BIFFRecords.BiffRecord):
    def __init__(self, rid, data):
        self._REC_ID = rid; self._rec_data = data
def _formula_biff(self):
    v = CACHED.get((self.rowx, self.colx))
    rpn = self.frmla.rpn()
    if v is None: res = struct.pack('<Q', 0xFFFF000000000003)
    elif isinstance(v, bool): res = struct.pack('<BBBBBBH', 1, 0, int(v), 0, 0, 0, 0xFFFF)
    elif isinstance(v, str) and v.startswith('#'): res = struct.pack('<BBBBBBH', 2, 0, {'#DIV/0!': 7, '#N/A': 0x2A}[v], 0, 0, 0, 0xFFFF)
    elif isinstance(v, str): res = struct.pack('<BBBBBBH', 0, 0, 0, 0, 0, 0, 0xFFFF)
    else: res = struct.pack('<d', v)
    data = _Raw(0x0006, struct.pack('<3H', self.rowx, self.colx, self.xf_idx) + res + struct.pack('<HL', 0, 0) + rpn).get()
    if isinstance(v, str) and not v.startswith('#'):
        try: v.encode('latin1'); body = struct.pack('<HB', len(v), 0) + v.encode('latin1')
        except UnicodeEncodeError: body = struct.pack('<HB', len(v), 1) + v.encode('utf-16le')
        data += _Raw(0x0207, body).get()
    return data
Cell.FormulaCell.get_biff_data = _formula_biff

def basic():
    wb = xlwt.Workbook(encoding="utf-8")
    ds = xlwt.easyxf(num_format_str="YYYY-MM-DD")
    dts = xlwt.easyxf(num_format_str="YYYY-MM-DD HH:MM:SS")
    ts = xlwt.easyxf(num_format_str="HH:MM")
    pct = xlwt.easyxf(num_format_str="0%")
    pct2 = xlwt.easyxf(num_format_str="0.00%")
    quoted = xlwt.easyxf(num_format_str='0.0" days"')
    ws = wb.add_sheet("Data")
    for c, h in enumerate(["Name", "Qty", "Price", "Active", "When", "Share", "Total"]):
        ws.write(0, c, h)
    rows = [
        ("Zoë", 1, 3.25, True, datetime.date(2024, 2, 29), 0.25),
        ("日本語テキスト", 42, 0.1 + 0.2, False, datetime.date(1999, 12, 31), 0.125),
        ("Ünïcödé € | pipe", -7, 1234567.891, True, datetime.date(1900, 3, 1), 1.0),
        ("big int", 1000000, 1e-7, False, datetime.date(2000, 1, 1), 0),
    ]
    for r, row in enumerate(rows, 1):
        ws.write(r, 0, row[0]); ws.write(r, 1, row[1]); ws.write(r, 2, row[2]); ws.write(r, 3, row[3])
        ws.write(r, 4, row[4], ds); ws.write(r, 5, row[5], pct if r != 2 else pct2)
        ws.write(r, 6, xlwt.Formula(f"B{r+1}*C{r+1}"))
        CACHED[(r, 6)] = row[1] * row[2]
    ws.write(6, 0, "datetime"); ws.write(6, 4, datetime.datetime(2023, 7, 14, 13, 45, 30), dts)
    ws.write(7, 0, "time"); ws.write(7, 4, datetime.time(8, 30), ts)
    ws.write(8, 0, "quoted fmt"); ws.write(8, 4, 2.5, quoted)
    ws.write(10, 0, "formulas")
    ws.write(10, 1, xlwt.Formula('"ab"&"cd"')); CACHED[(10, 1)] = "abcd"
    ws.write(10, 2, xlwt.Formula('1=1')); CACHED[(10, 2)] = True
    ws.write(10, 3, xlwt.Formula('1/0')); CACHED[(10, 3)] = "#DIV/0!"
    ws.write(10, 4, xlwt.Formula('"Grüße "&"Ω"')); CACHED[(10, 4)] = "Grüße Ω"
    ws.write(10, 5, xlwt.Formula('1=2')); CACHED[(10, 5)] = False
    ws.write(11, 0, "errors"); ws.write(11, 1, xlwt.Formula('NA()')); CACHED[(11, 1)] = "#N/A"
    ws.write(9, 0, "large"); ws.write(9, 1, 123456789012); ws.write(9, 2, 2**40)

    ls = wb.add_sheet("Long")
    ls.write(0, 0, "Kind"); ls.write(0, 1, "Text")
    long_ascii = "".join(f"[{i:05d}]" for i in range(1300))  # 9100 chars
    long_greek = "αβγδεζηθικλμνξοπρστυφχψω" * 400  # 9600 chars, 16-bit
    ls.write(1, 0, "ascii"); ls.write(1, 1, long_ascii)
    ls.write(2, 0, "greek"); ls.write(2, 1, long_greek)
    for i in range(600):
        ls.write(3 + i, 0, f"item {i}"); ls.write(3 + i, 1, f"value number {i:04d} ünï-{i}" if i % 3 == 0 else f"plain value number {i:04d}")
    ls.write(603, 0, "end"); ls.write(603, 1, "THE END")

    hs = wb.add_sheet("Secret")
    hs.visibility = 1
    hs.write(0, 0, "hidden"); hs.write(1, 0, "x")

    bs = wb.add_sheet("Big")
    bs.write(0, 0, "n"); bs.write(0, 1, "sq")
    for i in range(1, 1200):
        bs.write(i, 0, i); bs.write(i, 1, i * i)

    os_ = wb.add_sheet("Offset")
    os_.write(2, 2, "C3"); os_.write(2, 3, "D3"); os_.write(4, 3, 5.5)

    wb.add_sheet("Empty")
    wb.save(out + "/xlwt-basic.xls")

def d1904():
    wb = xlwt.Workbook(encoding="utf-8")
    wb.dates_1904 = True
    ds = xlwt.easyxf(num_format_str="DD/MM/YYYY")
    ws = wb.add_sheet("Dates1904")
    ws.write(0, 0, "Label"); ws.write(0, 1, "Date")
    ws.write(1, 0, "a"); ws.write(1, 1, datetime.date(2024, 2, 29), ds)
    ws.write(2, 0, "b"); ws.write(2, 1, datetime.date(1904, 1, 2), ds)
    ws.write(3, 0, "raw"); ws.write(3, 1, 100)
    wb.save(out + "/xlwt-1904.xls")

basic(); d1904()
