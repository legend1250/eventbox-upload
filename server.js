require('dotenv').config()
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const methodOverride = require('method-override');
const morgan = require('morgan');
const { convert } = require('convert-svg-to-png');

const app = express();
const corsOptions = {
  origin: [ `${process.env.HOST1}`, `${process.env.HOST2}`, 'http://localhost:3000' ],
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}
// cors
app.use(cors(corsOptions));

// Middleware
app.use(bodyParser.json());
app.use(methodOverride('_method'));

morgan.token('decodeUrl', function (req, res) {
  return decodeURI(req.originalUrl)
})

app.use(morgan('combined'))

// Mongo URI
const mongoURI = process.env.MONGODB_URI
if(!mongoURI){
  throw new Error(`MONGODB_URI env doesn't exist`)
}

// Create mongo connection
const conn = mongoose.createConnection(mongoURI, {
  useNewUrlParser: true,
  useCreateIndex: true,
  // sets how many times to try reconnecting
  reconnectTries: Number.MAX_VALUE,
  // sets the delay between every retry (milliseconds)
  reconnectInterval: 30000
  }
)

// Init gfs
let gfs;

conn.once('open', () => {
  // Init stream
  gfs = Grid(conn.db, mongoose.mongo);
  gfs.collection('uploads');
});

// Create storage engine
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    return new Promise((resolve, reject) => {
      crypto.randomBytes(16, (err, buf) => {
        if (err) {
          return reject(err);
        }
        const filename = buf.toString('hex') + path.extname(file.originalname);
        const fileInfo = {
          filename: filename,
          bucketName: 'uploads'
        };
        resolve(fileInfo);
      });
    });
  }
});
const upload = multer({ storage });

// @route GET /
// @desc Loads form
// app.get('/', (req, res) => {
//   gfs.files.find().toArray((err, files) => {
//     // Check if files
//     if (!files || files.length === 0) {
//       res.render('index', { files: false });
//     } else {
//       files.map(file => {
//         if (
//           file.contentType === 'image/jpeg' ||
//           file.contentType === 'image/png'
//         ) {
//           file.isImage = true;
//         } else {
//           file.isImage = false;
//         }
//       });
//       res.render('index', { files: files });
//     }
//   });
// });

// @route POST /upload
// @desc  Uploads file to DB
app.post('/upload', upload.single('file'), (req, res) => {
  res.json({ file: req.file });
});

// @route GET /files
// @desc  Display all files in JSON
app.get('/files', (req, res) => {
  gfs.files.find().toArray((err, files) => {
    // Check if files
    if (!files || files.length === 0) {
      return res.status(404).json({
        err: 'No files exist'
      });
    }

    // Files exist
    return res.json(files);
  });
});

// @route GET /files/:filename
// @desc  Display single file object
app.get('/files/:filename', (req, res) => {
  gfs.files.findOne({ filename: req.params.filename }, (err, file) => {
    // Check if file
    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exists'
      });
    }
    // File exists
    return res.json(file);
  });
});

// @route GET /image/:filename
// @desc Display Image
app.get('/image/:filename', (req, res) => {
  gfs.files.findOne({ filename: req.params.filename }, (err, file) => {
    // Check if file
    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exists'
      });
    }

    // Check if image
    if (file.contentType === 'image/jpeg' || file.contentType === 'image/png') {
      // Read output to browser
      const readstream = gfs.createReadStream(file.filename);
      readstream.pipe(res);
    } else {
      res.status(404).json({
        err: 'Not an image'
      });
    }
  });
});

// @route GET /ticket/:filename
// @desc Display ticket svg
app.get('/ticket/:filename', (req, res) => {
  gfs.files.findOne({ filename: req.params.filename }, async (err, file) => {
    // Check if file
    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exists'
      });
    }

    // Check if image
    if (file.contentType === 'image/svg+xml') {
      // Read output to browser
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
      })
      const readstream = gfs.createReadStream(file.filename);
      // const isPng = req.params.type === 1
      // console.log('isPng: ', isPng, ',type: ',req.params.type)
      // const png = await convert(readstream);
      readstream.pipe(res)
    } else {
      res.status(404).json({
        err: 'Not an image'
      });
    }
  });
});

// @route GET /ticket/:filename/:type
// @desc Display ticket (svg/png)
app.get('/ticket/:filename/:type', (req, res) => {
  gfs.files.findOne({ filename: req.params.filename }, async (err, file) => {
    // Check if file
    if (!file || file.length === 0) {
      return res.status(404).json({
        err: 'No file exists'
      });
    }

    // Check if image
    if (file.contentType === 'image/svg+xml') {
      // Read output to browser
      const readstream = gfs.createReadStream(file.filename);
      const isPng = req.params.type == 1
      if(isPng){
        // res.writeHead(200, {
        //   'Content-Type': 'image/png',
        // })
        const buffer = []
        const result = () => {
          return new Promise((resolve) => {
            readstream.on('data', (chunk) => {
              buffer.push(chunk)
            })
            readstream.on('end', async () => {
              const svgBuffer = Buffer.concat(buffer)
              const png = await convert(svgBuffer, {width: 480, height: 480});
              resolve(png)
            })
          })
        }
        const imgPng = await result()
        res.set('Content-Type', 'image/png');
        return res.send(imgPng)
      }
      else{
        res.writeHead(200, {
          'Content-Type': 'image/svg+xml',
        })
        readstream.pipe(res)
      }
    } else {
      res.status(404).json({
        err: 'Not an image'
      });
    }
  });
});

// @route DELETE /files/:id
// @desc  Delete file
app.delete('/files/:id', (req, res) => {
  gfs.remove({ _id: req.params.id, root: 'uploads' }, (err, gridStore) => {
    if (err) {
      return res.status(404).json({ err: err });
    }

    return res.status(200).json({
      status: 'success'
    })
  });
});

const port = process.env.SERVER_PORT || 3000;

app.listen(port, () => console.log(`Server started on port ${port}`));