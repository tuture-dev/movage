const fs = require('fs-extra');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios').default;
const pLimit = require('p-limit');

const IMAGE_HOSTING_URL = 'https://imgkr.com/api/files/upload';

function convertMimeToExt(mimeType) {
  return `.${mimeType.split('/')[1]}`;
}

function transferImage(image, tmpDir) {
  const matchArr = image.match(/!\[.*?\]\((.+?)\)/);
  const originalUrl = matchArr[1];

  return new Promise((resolve, reject) => {
    console.log(`Downloading from ${originalUrl} ...`);

    axios({
      method: 'get',
      url: originalUrl,
      responseType: 'stream',
    })
      .then((response) => {
        const ext = convertMimeToExt(response.headers['content-type']);
        const filename = path.join(tmpDir, Math.random().toString(16).slice(2, 10) + ext);
        const writeStream = fs.createWriteStream(filename);
        response.data.pipe(writeStream);

        writeStream.on('close', async () => {
          const form = new FormData();
          form.append('file', fs.createReadStream(filename));

          axios
            .post(IMAGE_HOSTING_URL, form, {
              headers: form.getHeaders(),
            })
            .then((response) => {
              const newUrl = response.data.data;
              console.log('Uploaded to', newUrl);

              resolve({ originalUrl, newUrl });
            })
            .catch((err) => reject(err));
        });
      })
      .catch((err) => reject(err));
  });
}

function moveImages(srcPath, destPath = null, concurrency = 2) {
  const tmpDir = 'tmp';

  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir);
  }

  let content = fs.readFileSync(srcPath).toString();

  const images = content.match(/!\[.*?\]\(.+?\)/g);
  const limit = pLimit(concurrency);
  const tasks = images.map((image) => limit(() => transferImage(image, tmpDir)));

  Promise.all(tasks)
    .then((results) => {
      results.forEach(({ originalUrl, newUrl }) => {
        content = content.replace(originalUrl, newUrl);
      });

      fs.writeFileSync(destPath || srcPath, content);
      console.log(`Saved to ${destPath}`);
      fs.removeSync(tmpDir);
    })
    .catch((err) => console.log(err));
}

exports.moveImages = moveImages;
