#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json, sys, win32com.client

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

EXCEL_FILE = r"d:\projects\houtai\apps\op-admin\server\config\道具表.xlsm"
JSON_FILE  = r"d:\projects\houtai\apps\op-admin\server\config\itemConfig.json"

def find_cols(ws):
    id_col = name_col = None
    header_row = 1
    for r in range(1, 11):
        for c in range(1, ws.UsedRange.Columns.Count + 1):
            try:
                if str(ws.Cells(r, c).Value or "").strip():
                    header_row = r
                    break
            except: pass
        if header_row == r: break

    for c in range(1, ws.UsedRange.Columns.Count + 1):
        try: val = str(ws.Cells(header_row, c).Value or "").strip().lower()
        except: val = ""
        if id_col is None and any(k in val for k in ["id","编号","道具id","itemid","item_id"]):
            id_col = c
        if name_col is None and any(k in val for k in ["名称","name","道具名","itemname"]):
            name_col = c

    id_col   = id_col   or 1
    name_col = name_col or 2
    return id_col, name_col, header_row

def convert():
    print(f"打开 Excel: {EXCEL_FILE}")
    xl = win32com.client.Dispatch("Excel.Application")
    xl.Visible = False
    xl.DisplayAlerts = False
    result, total, skipped = {}, 0, 0
    try:
        wb = xl.Workbooks.Open(EXCEL_FILE, ReadOnly=True, UpdateLinks=False)
        print(f"工作表数量: {wb.Sheets.Count}")
        ONLY_SHEET = "item"  # 只处理这张表
        for i in range(1, wb.Sheets.Count + 1):
            ws = wb.Sheets(i)
            if ws.Name != ONLY_SHEET:
                print(f"跳过工作表: [{ws.Name}]")
                continue
            print(f"\n处理工作表: [{ws.Name}]")
            used_rows = ws.UsedRange.Rows.Count
            if used_rows < 2:
                print("  跳过（数据不足2行）"); continue
            # item 表固定列结构：C列(3)=道具ID，B列(2)=道具名称
            id_col, name_col, header_row = 3, 2, 1
            print(f"  ID列={id_col}, 名称列={name_col}, 表头行={header_row}")
            cnt = 0
            for r in range(header_row + 1, used_rows + 1):
                try:
                    id_val   = ws.Cells(r, id_col).Value
                    name_val = ws.Cells(r, name_col).Value
                except:
                    skipped += 1; continue
                if id_val is None or str(id_val).strip() == "":
                    skipped += 1; continue
                item_id = str(int(id_val)) if isinstance(id_val, float) else str(id_val).strip()
                # 跳过非纯数字的 ID（表头行或无效行）
                if not item_id.lstrip('-').isdigit():
                    skipped += 1; continue
                item_name = str(name_val).strip() if name_val is not None else ""
                if item_id in result:
                    skipped += 1; continue
                result[item_id] = item_name
                cnt += 1; total += 1
            print(f"  本表读取 {cnt} 条")
        wb.Close(SaveChanges=False)
    finally:
        xl.Quit()

    with open(JSON_FILE, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\n[OK] 完成！写入 {total} 条，跳过 {skipped} 条 -> {JSON_FILE}")

if __name__ == "__main__":
    convert()
