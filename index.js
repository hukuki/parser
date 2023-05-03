const dbConnection = require('./model/db.js');
const File = require('./model/file.js');
const { MevzuatParser } = require('./parsers/mevzuatparser.js');
const { uploadFile, getFile } = require('./s3/s3.js');

const source_folder = 'mevzuat';
const target_md_folder = 'mevzuat_md';
const target_json_folder = 'mevzuat_json';

const parser = new MevzuatParser(source_folder, target_md_folder, target_json_folder);

parser.parse();

// getFile("mevzuat/6434ac357cf2f7ddc2a5a774").then((results) => {
//     console.log(results);
// });