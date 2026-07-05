// Insert into private-server src/index.js after express.urlencoded middleware.
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(
  '/login',
  express.static(path.join(__dirname, '../public/login'), {
    index: 'index.html',
    maxAge: 0,
    etag: true,
  }),
);
