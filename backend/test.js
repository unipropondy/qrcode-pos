const { poolPromise } = require('./config/db');
poolPromise.then(pool => {
  pool.request().query("SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'USERMASTER' AND COLUMN_NAME IN ('UserId', 'UserCode')").then(res => {
    console.log(res.recordset);
    process.exit(0);
  });
}).catch(console.error);
