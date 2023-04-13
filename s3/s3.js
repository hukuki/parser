require("dotenv").config();
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");

const REGION = "eu-central-1"; //e.g. "us-east-1"
// Create an Amazon S3 service client object.
const s3Client = new S3Client({ region: REGION });
// if bucket name is not provided, throw error
if (!process.env.S3_BUCKET_NAME) {
    throw new Error("S3_BUCKET_NAME is not defined");
}
const s3BucketName = process.env.S3_BUCKET_NAME;

const uploadFile = async (fileName, file) => {
    // call S3 to retrieve upload file to specified bucket
    const uploadParams = {
        Bucket: s3BucketName,
        Key: fileName,
        Body: file,
    };
    try {
        const results = await s3Client.send(new PutObjectCommand(uploadParams));
        return results;
    } catch (err) {
        console.log("Error", err);
    }
};

const getFile = async (fileName) => {
    // call S3 to retrieve upload file to specified bucket
    const getParams = {
        Bucket: s3BucketName,
        Key: fileName,
    };
    try {
        const results = await s3Client.send(new GetObjectCommand(getParams));
        const file = await results.Body.transformToByteArray();
        return file;
    } catch (err) {
        console.log("Error", err);
    }
};

module.exports = { uploadFile, getFile };
