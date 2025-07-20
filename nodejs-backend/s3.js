const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.S3_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

const s3 = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
  }
});

async function uploadToS3(localPath, s3Key) {
  const data = fs.readFileSync(localPath);
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: data
  });
  await s3.send(command);
  return `s3://${S3_BUCKET}/${s3Key}`;
}

async function downloadFromS3(s3Key, localPath) {
  const command = new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3Key });
  const response = await s3.send(command);
  const stream = response.Body;
  const writeStream = fs.createWriteStream(localPath);
  await new Promise((resolve, reject) => {
    stream.pipe(writeStream);
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  return localPath;
}

module.exports = {
  uploadToS3,
  downloadFromS3
}; 

