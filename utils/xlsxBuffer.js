const { PassThrough } = require("stream");
const ExcelJS = require("exceljs");

/**
 * Builds a single-sheet .xlsx as a Buffer with ExcelJS's streaming writer.
 * The in-memory Workbook builds a full object model of every cell first; on
 * the production instance's small CPU that took ~18s for one month of
 * activity logs (~10k rows), past the web client's request timeout. The
 * streaming writer serialises each row as it's added instead, and skips the
 * shared-strings table, for roughly half the CPU.
 *
 * @param {object} options
 * @param {string} options.sheetName
 * @param {{ header: string, key: string, width?: number }[]} options.columns
 * @param {object[]} options.rows - plain objects keyed by column `key`
 * @returns {Promise<Buffer>}
 */
const buildXlsxBuffer = async ({ sheetName, columns, rows }) => {
  const stream = new PassThrough();
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    stream.on("end", resolve);
    stream.on("error", reject);
  });

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useStyles: true, // for the bold header row
    useSharedStrings: false,
  });
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.commit();
  for (const row of rows) sheet.addRow(row).commit();
  sheet.commit();
  await workbook.commit();
  await done;

  return Buffer.concat(chunks);
};

module.exports = { buildXlsxBuffer };
