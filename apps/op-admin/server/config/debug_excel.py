import sys, win32com.client
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
xl = win32com.client.Dispatch('Excel.Application')
xl.Visible = False
xl.DisplayAlerts = False
wb = xl.Workbooks.Open(r'd:\projects\houtai\apps\op-admin\server\config\道具表.xlsm', ReadOnly=True, UpdateLinks=False)
ws = wb.Sheets('item')
cols = min(ws.UsedRange.Columns.Count, 12)
print(f"总列数: {ws.UsedRange.Columns.Count}, 总行数: {ws.UsedRange.Rows.Count}")
for r in range(1, 6):
    row = [str(ws.Cells(r,c).Value or '') for c in range(1, cols+1)]
    print(f"行{r}: {row}")
wb.Close(False)
xl.Quit()
