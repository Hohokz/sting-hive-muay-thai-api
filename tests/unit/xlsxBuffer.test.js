const ExcelJS = require("exceljs");
const { buildXlsxBuffer } = require("../../utils/xlsxBuffer");

describe("buildXlsxBuffer", () => {
  test("writes a readable sheet with a bold header and every row", async () => {
    const buffer = await buildXlsxBuffer({
      sheetName: "Activity Logs",
      columns: [
        { header: "ID", key: "id", width: 20 },
        { header: "Details", key: "details", width: 20 },
      ],
      rows: [
        { id: 1, details: '{"a":"ไทย"}' },
        { id: 2, details: "" },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Activity Logs");

    expect(sheet.getRow(1).values.slice(1)).toEqual(["ID", "Details"]);
    expect(sheet.getRow(1).font).toMatchObject({ bold: true });
    expect(sheet.getRow(2).values.slice(1)).toEqual([1, '{"a":"ไทย"}']);
    expect(sheet.getRow(3).getCell(1).value).toBe(2);
    expect(sheet.rowCount).toBe(3);
  });
});
