import serverlessHttp from 'serverless-http';
import app from './app.js';

export default serverlessHttp(app);
