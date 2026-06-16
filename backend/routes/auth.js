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
    const phone = req.body.phone?.trim();

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

    const memberId = require("crypto").randomUUID();
    await pool.request()
      .input("memberId", sql.UniqueIdentifier, memberId)
      .input("name", sql.NVarChar, username)
      .input("phone", sql.NVarChar, phone || "")
      .input("email", sql.NVarChar, "")
      .input("creditLimit", sql.Decimal, 0)
      .input("createdAt", sql.DateTime, new Date())
      .input("address", sql.VarChar, "")
      .input("isActive", sql.Bit, 1)
      .input("balance", sql.Decimal, 0)
      .input("currentBalance", sql.Decimal, 0)
      .input("createdBy", sql.UniqueIdentifier, newUserId)
      .input("modifiedBy", sql.UniqueIdentifier, newUserId)
      .input("modifiedDate", sql.DateTime, new Date())
      .input("lowBalanceAlertSent", sql.Bit, 0)
      .query(`
        INSERT INTO MemberMaster (MemberId, Name, Phone, Email, CreditLimit, CreatedAt, Address, IsActive, Balance, CurrentBalance, CreatedBy, ModifiedBy, ModifiedDate, LowBalanceAlertSent)
        VALUES (@memberId, @name, @phone, @email, @creditLimit, @createdAt, @address, @isActive, @balance, @currentBalance, @createdBy, @modifiedBy, @modifiedDate, @lowBalanceAlertSent)
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
