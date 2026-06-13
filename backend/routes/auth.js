const express = require("express");
const router = express.Router();
const { poolPromise, sql } = require("../config/db");

// ✅ LOGIN API
router.post("/login", async (req, res) => {
  try {
    const username = req.body.username?.trim();
   const password = req.body.password?.trim();

     const encodedPassword = Buffer.from(password).toString("base64");

    const pool = await poolPromise;

    const result = await pool.request()
      .input("username", sql.VarChar, username)
      .input("password", sql.VarChar, encodedPassword)
      .query(`
        SELECT * FROM USERMASTER
        WHERE UserName = @username 
        AND UserPassword = @password
        AND IsDisabled = 0
      `);

    if (result.recordset.length > 0) {
      res.json({
        success: true,
        user: result.recordset[0]
      });
    } else {
      res.status(401).json({
        success: false,
        message: "Invalid username or password"
      });
    }

  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ✅ SIGNUP API
router.post("/signup", async (req, res) => {
  try {
    const username = req.body.username?.trim();
    const password = req.body.password?.trim();

    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required" });
    }

    const encodedPassword = Buffer.from(password).toString("base64");
    const pool = await poolPromise;

    const checkUser = await pool.request()
      .input("username", sql.VarChar, username)
      .query(`SELECT * FROM USERMASTER WHERE UserName = @username`);

    if (checkUser.recordset.length > 0) {
      return res.status(409).json({ success: false, message: "Username already exists" });
    }

    const newUserId = require("crypto").randomUUID();
    const newUserCode = username.substring(0, 50); // Using username as UserCode (max 50 chars)

    await pool.request()
      .input("userId", sql.UniqueIdentifier, newUserId)
      .input("userCode", sql.VarChar, newUserCode)
      .input("username", sql.VarChar, username)
      .input("password", sql.VarChar, encodedPassword)
      .query(`
        INSERT INTO USERMASTER (UserId, UserCode, UserName, UserPassword, IsDisabled)
        VALUES (@userId, @userCode, @username, @password, 0)
      `);

    const newUser = await pool.request()
      .input("username", sql.VarChar, username)
      .query(`SELECT * FROM USERMASTER WHERE UserName = @username`);

    res.json({
      success: true,
      user: newUser.recordset[0]
    });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

module.exports = router;
