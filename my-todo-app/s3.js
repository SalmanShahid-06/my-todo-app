// s3.js
// WHY THIS FILE EXISTS:
// All the code that talks to Amazon S3 lives here, the same way database.js
// holds all the code that talks to MySQL. This keeps server.js focused on
// routes, and keeps every S3 detail (bucket name, file naming, links) in one place.

// The AWS SDK gives us ready-made "commands" for each S3 action:
// PutObject = upload, GetObject = download, ListObjectsV2 = list files,
// DeleteObjects = delete several files at once.
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require("@aws-sdk/client-s3");

// "getSignedUrl" creates temporary links to private files (see listTodoFiles).
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Notice there are NO access keys in this file, on purpose. The SDK finds
// credentials automatically: on EC2 it uses the IAM role we attached
// (MyAppEC2Role), and on your laptop it uses the keys saved by "aws configure".
// The region is the REGION (ap-southeast-2), never the zone (ap-southeast-2b).
const s3 = new S3Client({ region: process.env.AWS_REGION || "ap-southeast-2" });

// The bucket name comes from the .env file, just like our other settings.
const BUCKET = process.env.S3_BUCKET;

// Every todo gets its own "folder" in the bucket, for example:
//   users/4/todos/17/1792656141552-receipt.pdf
// Because the user's ID and the todo's ID are part of the path, we can find
// all of a todo's files just by listing this prefix -- so we don't need to
// change the MySQL tables at all.
function todoPrefix(userId, todoId) {
  return `users/${userId}/todos/${todoId}/`;
}

// File names typed by users can contain spaces, slashes, or odd symbols that
// cause trouble in S3 paths and URLs. We swap anything unusual for "_".
function safeFileName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Upload one file to a todo's folder. "file" is the object multer gives us:
// file.buffer holds the bytes, file.originalname the name, file.mimetype the type.
async function uploadTodoFile(userId, todoId, file) {
  // Adding Date.now() in front means two files with the same name never
  // overwrite each other.
  const key = `${todoPrefix(userId, todoId)}${Date.now()}-${safeFileName(file.originalname)}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: file.buffer,
      // Saving the content type lets browsers display images and PDFs properly.
      ContentType: file.mimetype,
    })
  );

  return key;
}

// List all files attached to a todo, each with a temporary download link.
// WHY temporary links: our bucket is private, so a normal S3 URL would show
// "Access Denied". A "presigned URL" is a link signed with our server's
// permissions that works for a limited time (here, 1 hour), then expires.
async function listTodoFiles(userId, todoId) {
  const result = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: todoPrefix(userId, todoId) })
  );

  // "Contents" is missing entirely when the folder is empty, so default to [].
  const objects = result.Contents || [];

  return Promise.all(
    objects.map(async (obj) => {
      const url = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: BUCKET, Key: obj.Key }),
        { expiresIn: 3600 }
      );
      // Show the user the original name, without the folder path and the
      // timestamp we added at upload time.
      const storedName = obj.Key.split("/").pop();
      const name = storedName.replace(/^\d+-/, "");
      return { key: obj.Key, name, size: obj.Size, url };
    })
  );
}

// Delete every file attached to a todo. We call this when the todo itself is
// deleted, so no orphaned files are left behind in the bucket costing storage.
async function deleteTodoFiles(userId, todoId) {
  const result = await s3.send(
    new ListObjectsV2Command({ Bucket: BUCKET, Prefix: todoPrefix(userId, todoId) })
  );
  const objects = result.Contents || [];

  // Nothing to delete -- skip the extra request.
  if (objects.length === 0) return;

  await s3.send(
    new DeleteObjectsCommand({
      Bucket: BUCKET,
      Delete: { Objects: objects.map((obj) => ({ Key: obj.Key })) },
    })
  );
}

module.exports = { uploadTodoFile, listTodoFiles, deleteTodoFiles };
