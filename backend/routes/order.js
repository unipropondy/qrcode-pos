const express = require("express");
const router = express.Router();
const sql = require("mssql");
const { poolPromise } = require("../config/db");
const DEFAULT_GUID = "00000000-0000-0000-0000-000000000000";

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const NOTE_KEYS = ["note", "Note", "notes", "Notes", "remarks", "Remarks"];
const TAKEAWAY_KEYS = ["isTakeaway", "IsTakeaway", "isTakeAway", "IsTakeAway"];
const SPICY_KEYS = ["spicy", "Spicy"];
const SALT_KEYS = ["salt", "Salt"];
const OIL_KEYS = ["oil", "Oil"];
const SUGAR_KEYS = ["sugar", "Sugar"];

function resolveItemTextField(item = {}, keys = []) {
  const itemKeys = Object.keys(item || {});
  
  for (const k of keys) {
    // Find the actual key in the item that matches (case-insensitive)
    const actualKey = itemKeys.find(ik => ik.toLowerCase() === k.toLowerCase());
    if (actualKey !== undefined) {
      const raw = item[actualKey];
      // Only return if it's not null/undefined
      if (raw !== undefined && raw !== null) {
        return { hasExplicitValue: true, value: String(raw) };
      }
    }
  }

  return { hasExplicitValue: false, value: "" };
}

function resolveItemNote(item = {}) {
  const result = resolveItemTextField(item, NOTE_KEYS);
  return { hasExplicitNote: result.hasExplicitValue, value: result.value };
}

function resolveItemTakeaway(item = {}) {
  const result = resolveItemTextField(item, TAKEAWAY_KEYS);
  const val = result.value.toLowerCase();
  return { 
    hasExplicitTakeaway: result.hasExplicitValue, 
    value: result.hasExplicitValue ? (val === "true" || val === "1" || result.value === "true") : false 
  };
}

function resolveItemSpicy(item = {}) {
  return resolveItemTextField(item, SPICY_KEYS);
}

function resolveItemSalt(item = {}) {
  return resolveItemTextField(item, SALT_KEYS);
}

function resolveItemOil(item = {}) {
  return resolveItemTextField(item, OIL_KEYS);
}

function resolveItemSugar(item = {}) {
  return resolveItemTextField(item, SUGAR_KEYS);
}

function mergeItemWithFallback(item = {}, fallback = {}) {
  const noteInfo = resolveItemNote(item);
  const takeawayInfo = resolveItemTakeaway(item);
  const spicyInfo = resolveItemSpicy(item);
  const saltInfo = resolveItemSalt(item);
  const oilInfo = resolveItemOil(item);
  const sugarInfo = resolveItemSugar(item);

  return {
    ...fallback,
    ...item,
    note: noteInfo.hasExplicitNote ? noteInfo.value : (fallback.Note ?? fallback.note ?? fallback.Remarks ?? fallback.remarks ?? ""),
    isTakeaway: takeawayInfo.hasExplicitTakeaway ? takeawayInfo.value : !!(fallback.IsTakeaway ?? fallback.isTakeaway ?? fallback.isTakeAway ?? fallback.IsTakeAway ?? false),
    spicy: spicyInfo.hasExplicitValue ? spicyInfo.value : (fallback.Spicy ?? fallback.spicy ?? ""),
    salt: saltInfo.hasExplicitValue ? saltInfo.value : (fallback.Salt ?? fallback.salt ?? ""),
    oil: oilInfo.hasExplicitValue ? oilInfo.value : (fallback.Oil ?? fallback.oil ?? ""),
    sugar: sugarInfo.hasExplicitValue ? sugarInfo.value : (fallback.Sugar ?? fallback.sugar ?? ""),
  };
}

/**
 * Get or Generate Order ID for a table
 * Returns existing ID if table is active, otherwise generates a new one.
 */
async function getOrGenerateOrderId(req, tableId) {
  const pool = await poolPromise;
  const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();

  // 1. Check if table already has an ID (Only for Dine-In)
  if (tableId && tableId !== "undefined" && tableId !== "null") {
    const tableCheck = await pool.request()
      .input("tid", sql.NVarChar(128), cleanId)
      .query("SELECT CurrentOrderId FROM TableMaster WHERE TableId = @tid");

    if (tableCheck.recordset[0]?.CurrentOrderId) {
      return tableCheck.recordset[0].CurrentOrderId;
    }
  }

  // 2. Resolve BusinessUnitId (Safe Logic)
  const bizRow = await pool.request().query(`
    SELECT TOP 1 BusinessUnitId FROM [dbo].[PaymentDetailCur] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
    UNION ALL
    SELECT TOP 1 BusinessUnitId FROM [dbo].[SettlementHeader] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
  `);
  let businessUnitId = bizRow.recordset.length > 0 ? bizRow.recordset[0].BusinessUnitId : DEFAULT_GUID;

  // 3. Atomic Sequence Generation
  // Use IST (+5:30) for date string to ensure reset at midnight local time
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istDate = new Date(now.getTime() + istOffset);
  const todayStr = istDate.toISOString().split('T')[0];
  
  let dailySequence;
  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    let seqResult = await transaction.request()
      .input("RestId", sql.UniqueIdentifier, businessUnitId)
      .input("Today", sql.Date, todayStr)
      .query(`
        UPDATE OrderSequences 
        SET LastNumber = LastNumber + 1 
        OUTPUT INSERTED.LastNumber
        WHERE RestaurantId = @RestId AND SequenceDate = @Today
      `);

    if (seqResult.recordset.length > 0) {
      dailySequence = seqResult.recordset[0].LastNumber;
    } else {
      await transaction.request()
        .input("RestId", sql.UniqueIdentifier, businessUnitId)
        .input("Today", sql.Date, todayStr)
        .query(`
          INSERT INTO OrderSequences (RestaurantId, SequenceDate, LastNumber)
          VALUES (@RestId, @Today, 1)
        `);
      dailySequence = 1;
    }
    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  const displayOrderId = `${todayStr.replace(/-/g, '')}-${String(dailySequence).padStart(4, '0')}`;
  
  // 4. Attach to Table
  await pool.request()
    .input("tid", sql.UniqueIdentifier, cleanId)
    .input("oid", sql.NVarChar(50), displayOrderId)
    .query(`
      UPDATE TableMaster 
      SET CurrentOrderId = @oid, 
          StartTime = CASE 
            WHEN StartTime IS NULL OR StartTime < '2000-01-01' THEN GETDATE() 
            ELSE StartTime 
          END
      WHERE TableId = @tid
    `);

  console.log(`✨ [OrderID] Generated ${displayOrderId} for Table ${cleanId}`);
  return displayOrderId;
}

/**
 * Update Table Status Helper
 * Sets TableMaster Status and emits socket event
 */
async function updateTableStatus(req, tableId, status) {
  if (!tableId) throw new Error("tableId is required for status update");
  const pool = await poolPromise;
  const cleanId = tableId.replace(/^\{|\}$/g, "").trim();
  
  console.log(`🛠️ [DB] Attempting status update: Table=${cleanId}, Status=${status}`);

  const result = await pool.request()
    .input("tableId", sql.VarChar(50), cleanId)
    .input("status", sql.Int, status)
    .query(`
      UPDATE TableMaster        SET Status = @status,
          StartTime = CASE 
            WHEN (@status = 1 OR @status = 3) AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE()
            WHEN @status = 0 THEN NULL
            ELSE StartTime
          END,
          CurrentOrderId = CASE 
            WHEN @status = 0 THEN NULL
            ELSE CurrentOrderId
          END,
          ModifiedOn = GETDATE()
      WHERE UPPER(CAST(TableId AS VARCHAR(50))) = UPPER(@tableId)
    `);

  console.log(`✅ [DB] Update result: ${result.rowsAffected[0]} row(s) affected`);

  if (result.rowsAffected[0] > 0) {
    const io = req.app.get("io");
    if (io) {
      // Get full state for accurate broadcast
      const tableRes = await pool.request()
        .input("tableId", sql.VarChar(50), cleanId)
        .query(`
          SELECT TotalAmount, CONVERT(VARCHAR, StartTime, 126) AS StartTime,
          CASE 
            WHEN Status = 1 AND StartTime IS NOT NULL AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
            ELSE 0 
          END AS isOvertime
          FROM TableMaster WHERE TableId = @tableId
        `);
      
      const row = tableRes.recordset[0];
      io.emit("table_status_updated", { 
        tableId: cleanId, 
        status: Number(status),
        totalAmount: row?.TotalAmount || 0,
        startTime: row?.StartTime || null,
        isOvertime: row?.isOvertime || 0
      });
    }
  }
}

/**
 * Professional Table Sync Helper
 * Syncs CartItems to RestaurantOrderCur, RestaurantOrderDetailCur, and RestaurantmodifierdetailCur
 */
async function syncToProfessionalTables(transaction, tableId, displayOrderId, items, userId) {
  const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();
  const cleanOrderNo = String(displayOrderId || "PENDING").replace(/^\{|\}$/g, "").trim();

  // Resolve actual TableNumber (Tableno column is char(10))
  let actualTableNo = "TAKEAWAY";
  if (cleanTableId && cleanTableId !== "undefined") {
    const tCheck = await transaction.request()
      .input("tid", sql.UniqueIdentifier, cleanTableId)
      .query("SELECT TableNumber FROM TableMaster WHERE TableId = @tid");
    if (tCheck.recordset.length > 0) {
      actualTableNo = tCheck.recordset[0].TableNumber;
    }
  }

  // Resolve BusinessUnitId (required for professional tables)
  let bizId = DEFAULT_GUID;
  const bizCheck = await transaction.request().query(`
    SELECT TOP 1 BusinessUnitId FROM [dbo].[PaymentDetailCur] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
    UNION ALL
    SELECT TOP 1 BusinessUnitId FROM [dbo].[SettlementHeader] WHERE BusinessUnitId IS NOT NULL AND BusinessUnitId <> '00000000-0000-0000-0000-000000000000'
  `);
  if (bizCheck.recordset.length > 0) {
    bizId = bizCheck.recordset[0].BusinessUnitId;
  }

  // 1. Resolve or Create Order Header (RestaurantOrderCur)
  let orderGuid;
  
  // Use a more robust check: Look for the order by number OR by the active table
  const headerCheck = await transaction.request()
    .input("orderNo", sql.NVarChar(50), cleanOrderNo)
    .input("tableNo", sql.VarChar(10), actualTableNo)
    .query("SELECT OrderId, BusinessUnitId FROM RestaurantOrderCur WHERE OrderNumber = @orderNo OR (Tableno = @tableNo AND isOrderClosed = 0)");

  if (headerCheck.recordset.length > 0) {
    orderGuid = headerCheck.recordset[0].OrderId;
    if (headerCheck.recordset[0].BusinessUnitId) bizId = headerCheck.recordset[0].BusinessUnitId;

    // Update the order number if it was pending but now we have a real one
    if (cleanOrderNo !== "PENDING") {
       await transaction.request()
         .input("orderId", sql.UniqueIdentifier, orderGuid)
         .input("orderNo", sql.NVarChar(50), cleanOrderNo)
         .query("UPDATE RestaurantOrderCur SET OrderNumber = @orderNo WHERE OrderId = @orderId");
    }
  } else {
    orderGuid = require("crypto").randomUUID();
    const finalOrderNo = (cleanOrderNo === "PENDING") ? "TMP-" + cleanTableId + "-" + Date.now().toString().slice(-4) : cleanOrderNo;
    
    await transaction.request()
      .input("orderId", sql.UniqueIdentifier, orderGuid)
      .input("orderNo", sql.NVarChar(50), finalOrderNo)
      .input("tableNo", sql.VarChar(10), actualTableNo)
      .input("userId", sql.UniqueIdentifier, userId || '00000000-0000-0000-0000-000000000000')
      .input("bizId", sql.UniqueIdentifier, bizId) 
      .query(`
        INSERT INTO RestaurantOrderCur 
        (OrderId, OrderNumber, OrderDateTime, Tableno, StatusCode, CreatedBy, CreatedOn, isOrderClosed, BusinessUnitId)
        VALUES 
        (@orderId, @orderNo, GETDATE(), @tableNo, 1, @userId, GETDATE(), 0, @bizId)
      `);
    console.log(`✨ [Sync] Created new professional header for Table ${cleanTableId}`);
  }

  // 2. Sync Items (RestaurantOrderDetailCur)
  // First, clear existing professional details that are being refreshed (only if they are NEW/PENDING in professional context)
  // For simplicity in this session, we refresh based on the ItemId (GUID)
  for (const item of items) {
    const cleanProdId = String(item.id || item.ProductId).replace(/^\{|\}$/g, "").trim();
    const lineItemId = item.lineItemId || item.ItemId || require("crypto").randomUUID();

    // Check if detail already exists
    const detailCheck = await transaction.request()
      .input("detailId", sql.UniqueIdentifier, lineItemId)
      .query("SELECT OrderDetailId FROM RestaurantOrderDetailCur WHERE OrderDetailId = @detailId");

    // Map string status to professional numeric StatusCode
    const statusCodes = { 'NEW': 1, 'SENT': 2, 'READY': 3, 'SERVED': 4, 'HOLD': 5, 'VOIDED': 0 };
    const currentStatusCode = statusCodes[item.status || item.Status] || 2; // Default to 2 (SENT)

    const finalUserId = userId || '00000000-0000-0000-0000-000000000000';
    const dishName = (item.name || item.ProductName || 'Dish').substring(0, 200);
    const unitPrice = item.price || item.Cost || 0;
    const totalLineAmount = unitPrice * (item.qty || item.Quantity || 1);
    // bizId is already resolved above

    const noteInfo = resolveItemNote(item);
    const takeawayInfo = resolveItemTakeaway(item);
    const spicyInfo = resolveItemSpicy(item);
    const saltInfo = resolveItemSalt(item);
    const oilInfo = resolveItemOil(item);
    const sugarInfo = resolveItemSugar(item);

    if (detailCheck.recordset.length > 0) {
      // Update existing
      await transaction.request()
        .input("detailId", sql.UniqueIdentifier, lineItemId)
        .input("qty", sql.Int, item.qty || item.Quantity || 1)
        .input("cost", sql.Decimal(18, 2), unitPrice)
        .input("total", sql.Decimal(18, 2), totalLineAmount)
        .input("statusCode", sql.Int, currentStatusCode)
        .input("userId", sql.UniqueIdentifier, finalUserId)
        .input("desc", sql.NVarChar(200), dishName)
        .input("spicy", sql.NVarChar(50), spicyInfo.hasExplicitValue ? spicyInfo.value.substring(0, 50) : null)
        .input("salt", sql.NVarChar(50), saltInfo.hasExplicitValue ? saltInfo.value.substring(0, 50) : null)
        .input("oil", sql.NVarChar(50), oilInfo.hasExplicitValue ? oilInfo.value.substring(0, 50) : null)
        .input("sugar", sql.NVarChar(50), sugarInfo.hasExplicitValue ? sugarInfo.value.substring(0, 50) : null)
        .input("note", sql.NVarChar(300), noteInfo.hasExplicitNote ? noteInfo.value.substring(0, 300) : null)
        .input("isTakeaway", sql.Bit, takeawayInfo.hasExplicitTakeaway ? (takeawayInfo.value ? 1 : 0) : null)
        .query(`
          -- Log update if metadata present
          PRINT 'Updating metadata for ' + CAST(@detailId AS VARCHAR(50)) + ': Note=' + ISNULL(@note, 'NULL');
          
          UPDATE RestaurantOrderDetailCur 
          SET Quantity = @qty, PricePerUnit = @cost, ActualAmount = @total, 
              TotalDetailLineAmount = @total, 
              StatusCode = CASE WHEN @statusCode >= StatusCode OR @statusCode = 0 THEN @statusCode ELSE StatusCode END, 
              Description = @desc, DishName = @desc, ModifiedBy = @userId, ModifiedOn = GETDATE(),
              Spicy = CASE WHEN @spicy IS NULL THEN Spicy ELSE @spicy END,
              Salt = CASE WHEN @salt IS NULL THEN Salt ELSE @salt END,
              Oil = CASE WHEN @oil IS NULL THEN Oil ELSE @oil END,
              Sugar = CASE WHEN @sugar IS NULL THEN Sugar ELSE @sugar END,
              Remarks = CASE WHEN @note IS NOT NULL THEN @note ELSE Remarks END,
              isTakeAway = CASE WHEN @isTakeaway IS NOT NULL THEN @isTakeaway ELSE isTakeAway END
          WHERE OrderDetailId = @detailId
        `);
    } else {
      // Insert new
      await transaction.request()
        .input("detailId", sql.UniqueIdentifier, lineItemId)
        .input("orderId", sql.UniqueIdentifier, orderGuid)
        .input("dishId", sql.UniqueIdentifier, cleanProdId)
        .input("qty", sql.Int, item.qty || item.Quantity || 1)
        .input("cost", sql.Decimal(18, 2), unitPrice)
        .input("total", sql.Decimal(18, 2), totalLineAmount)
        .input("statusCode", sql.Int, currentStatusCode)
        .input("userId", sql.UniqueIdentifier, finalUserId)
        .input("desc", sql.NVarChar(200), dishName)
        .input("bizId", sql.UniqueIdentifier, bizId)
        .input("spicy", sql.NVarChar(50), spicyInfo.value.substring(0, 50))
        .input("salt", sql.NVarChar(50), saltInfo.value.substring(0, 50))
        .input("oil", sql.NVarChar(50), oilInfo.value.substring(0, 50))
        .input("sugar", sql.NVarChar(50), sugarInfo.value.substring(0, 50))
        .input("note", sql.NVarChar(300), noteInfo.value.substring(0, 300))
        .input("isTakeaway", sql.Bit, takeawayInfo.value ? 1 : 0)
        .query(`
          INSERT INTO RestaurantOrderDetailCur 
          (OrderDetailId, OrderId, DishId, Description, DishName, Quantity, PricePerUnit, ActualAmount, TotalDetailLineAmount, StatusCode, CreatedBy, CreatedOn, 
           Spicy, Salt, Oil, Sugar, Remarks, isTakeAway, isReady, isDelivered, BusinessUnitId, OrderDateTime)
          VALUES 
          (@detailId, @orderId, @dishId, @desc, @desc, @qty, @cost, @total, @total, @statusCode, @userId, GETDATE(), 
           @spicy, @salt, @oil, @sugar, @note, ISNULL(@isTakeaway, 0), 0, 0, @bizId, GETDATE())
        `);
    }

    // 3. Sync Modifiers (RestaurantmodifierdetailCur)
    // Clear existing for this line item
    await transaction.request()
      .input("detailId", sql.UniqueIdentifier, lineItemId)
      .query("DELETE FROM RestaurantmodifierdetailCur WHERE OrderDetailId = @detailId");

    const modifiers = typeof item.modifiers === 'string' ? JSON.parse(item.modifiers) : (item.modifiers || []);
    if (modifiers.length > 0) {
      for (const mod of modifiers) {
        await transaction.request()
          .input("detailId", sql.UniqueIdentifier, lineItemId)
          .input("orderId", sql.UniqueIdentifier, orderGuid)
          .input("dishId", sql.UniqueIdentifier, cleanProdId)
          .input("modId", sql.UniqueIdentifier, mod.ModifierId || mod.ModifierID)
          .input("qty", sql.Int, item.qty || 1)
          .input("amt", sql.Decimal(18, 2), mod.Price || 0)
          .input("name", sql.NVarChar(800), mod.ModifierName || "")
          .input("userId", sql.UniqueIdentifier, userId || null)
          .query(`
            INSERT INTO RestaurantmodifierdetailCur 
            (OrderDetailId, OrderId, DishId, ModifierId, Quantity, Amount, ModifierName, CreatedBy, CreatedOn)
            VALUES 
            (@detailId, @orderId, @dishId, @modId, @qty, @amt, @name, @userId, GETDATE())
          `);
      }
    }

    // 4. 🔥 PROMOTE SPECIAL INSTRUCTION TO MODIFIER (Professional KOT/KDS Requirement)
    const specialNote = noteInfo.value;
    if (specialNote && specialNote.trim() !== "") {
      const virtualModId = '00000000-0000-0000-0000-000000000001'; // Constant Virtual ID for Note
      await transaction.request()
        .input("detailId", sql.UniqueIdentifier, lineItemId)
        .input("orderId", sql.UniqueIdentifier, orderGuid)
        .input("dishId", sql.UniqueIdentifier, cleanProdId)
        .input("modId", sql.UniqueIdentifier, virtualModId)
        .input("qty", sql.Int, item.qty || 1)
        .input("amt", sql.Decimal(18, 2), 0)
        .input("name", sql.NVarChar(800), "INSTR: " + specialNote.trim())
        .input("userId", sql.UniqueIdentifier, userId || null)
        .query(`
          INSERT INTO RestaurantmodifierdetailCur 
          (OrderDetailId, OrderId, DishId, ModifierId, Quantity, Amount, ModifierName, CreatedBy, CreatedOn)
          VALUES 
          (@detailId, @orderId, @dishId, @modId, @qty, @amt, @name, @userId, GETDATE())
        `);
      console.log(`📝 [Sync] Promoted note for Item ${lineItemId} to Modifier`);
    }
  }

  // 5. Update Header Totals
  await transaction.request()
    .input("orderId", sql.UniqueIdentifier, orderGuid)
    .query(`
      UPDATE RestaurantOrderCur 
      SET TotalAmount = (SELECT ISNULL(SUM(ActualAmount), 0) FROM RestaurantOrderDetailCur WHERE OrderId = @orderId)
          + (SELECT ISNULL(SUM(Amount * Quantity), 0) FROM RestaurantmodifierdetailCur WHERE OrderId = @orderId)
      WHERE OrderId = @orderId
    `);
}

/**
 * Checkout Order
 * Sets table status to 2 (Checkout) to indicate bill is printed/pending payment
 */
router.post("/checkout", async (req, res) => {
  try {
    const { tableId } = req.body;
    if (!tableId) return res.status(400).json({ error: "tableId is required" });

    const pool = await poolPromise;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();

    // 1. Update Table Status to 2 (Checkout)
    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query("UPDATE TableMaster SET Status = 2, ModifiedOn = GETDATE() WHERE TableId = @tid");

    // 2. Fetch current state for response
    const result = await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query(`
        SELECT Status, TotalAmount, CurrentOrderId, CONVERT(VARCHAR, StartTime, 126) AS StartTime
        FROM TableMaster WHERE TableId = @tid
      `);

    const updated = result.recordset[0];

    // 3. Emit socket update
    const io = req.app.get("io");
    if (io) {
      io.emit("table_status_updated", {
        tableId: cleanId,
        status: 2,
        totalAmount: updated?.TotalAmount || 0,
        currentOrderId: updated?.CurrentOrderId,
        StartTime: updated?.StartTime
      });
    }

    console.log(`💳 [Checkout] Table ${cleanId} locked for payment (Status 2)`);
    res.json({ success: true, orderId: updated?.CurrentOrderId });
  } catch (err) {
    console.error("❌ [Checkout] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Sync Table Status & Total
 * Recalculates total from CartItems and updates TableMaster
 */
async function syncTableStatus(req, tableId) {
  try {
    const pool = await poolPromise;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
    const userId = req.body?.userId || req.body?.UserId || req.body?.cashierId || req.body?.serverId || null;

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Recalculate and Update TableMaster
      const result = await transaction.request()
        .input("tableId", sql.UniqueIdentifier, cleanId)
        .query(`
          DECLARE @itemCount INT = 0;
          DECLARE @total DECIMAL(18,2) = 0;
          
          SELECT @itemCount = COUNT(*), @total = ISNULL(SUM((Cost * (1 - ISNULL(DiscountAmount, 0)/100)) * Quantity), 0) 
          FROM CartItems WHERE TRY_CAST(CartId AS UniqueIdentifier) = @tableId AND (Status <> 'VOIDED' OR Status IS NULL);

          UPDATE TableMaster
          SET 
            Status = CASE 
              WHEN @itemCount > 0 THEN (CASE WHEN Status = 0 THEN 1 ELSE Status END)
              ELSE (CASE WHEN Status IN (1, 2, 3, 4) THEN 0 ELSE Status END)
            END,
            StartTime = CASE 
              WHEN @itemCount > 0 AND (StartTime IS NULL OR StartTime < '2000-01-01') THEN GETDATE()
              WHEN @itemCount = 0 THEN NULL
              ELSE StartTime
            END,
            TotalAmount = @total,
            ModifiedOn = GETDATE()
          WHERE TableId = @tableId;

          SELECT Status, TotalAmount, CONVERT(VARCHAR, StartTime, 126) AS StartTime, CurrentOrderId,
          CASE 
            WHEN Status IN (1, 2, 3) AND StartTime IS NOT NULL AND StartTime > '2000-01-01' AND DATEDIFF(MINUTE, StartTime, GETDATE()) >= 60 THEN 1 
            ELSE 0 
          END AS isOvertime
          FROM TableMaster WHERE TableId = @tableId;
        `);

      const updated = result.recordset[0];
      await transaction.commit();

      if (updated) {
        const io = req.app.get("io");
        if (io) {
          io.emit("table_status_updated", { 
            tableId: cleanId, 
            status: updated.Status,
            totalAmount: updated.TotalAmount,
            StartTime: updated.StartTime,
            currentOrderId: updated.CurrentOrderId,
            isOvertime: updated.isOvertime || 0
          });
          io.emit("cart_updated", { tableId: cleanId });
        }
      }
      return updated;
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    console.error("❌ [SyncTable] Error:", err.message);
    throw err;
  }
}

// 1. Send Order (KOT/KDS) -> Dining
router.post("/send", async (req, res) => {
  try {
    const { tableId, orderType } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    
    // ✅ FIX: Treat as takeaway ONLY if no tableId is provided
    const isTakeaway = (!tableId || tableId === "undefined" || tableId === "null");

    const pool = await poolPromise;
    const cleanId = tableId && tableId !== "undefined" && tableId !== "null" ? String(tableId).replace(/^\{|\}$/g, "").trim() : null;

    // Generate Order ID (Logic handles null tableId for Takeaway)
    const currentOrderId = await getOrGenerateOrderId(req, cleanId);

    if (cleanId) {
      // 🚀 PARALLEL UPDATES: Update TableMaster & CartItems concurrently
      const updateTable = pool.request()
        .input("tableId", sql.VarChar(50), cleanId)
        .input("orderId", sql.NVarChar(50), currentOrderId)
        .input("ModifiedBy", sql.UniqueIdentifier, userId || null)
        .query(`
          UPDATE TableMaster 
          SET Status = 1, 
              CurrentOrderId = @orderId, 
              StartTime = GETDATE(), 
              ModifiedBy = @ModifiedBy 
          WHERE TableId = @tableId
        `);
    
      const updateCart = pool.request()
        .input("cartId", sql.NVarChar(128), cleanId)
        .input("orderId", sql.NVarChar(50), currentOrderId)
        .input("ModifiedBy", sql.UniqueIdentifier, userId || null)
        .query("UPDATE CartItems SET OrderNo = @orderId, DateCreated = GETDATE(), Status = 'SENT', ModifiedBy = @ModifiedBy WHERE CartId = @cartId AND (OrderNo IS NULL OR OrderNo = 'PENDING' OR Status = 'NEW')");

      await Promise.all([updateTable, updateCart]);

      // 🚀 BACKGROUND SYNC FOR DINE-IN: Fetch all items and sync to professional KDS (Non-blocking)
      (async () => {
        try {
          const bgPool = await poolPromise;
          const cartItemsRes = await bgPool.request()
            .input("cartId", sql.NVarChar(128), cleanId)
            .query(`
              SELECT c.*, d.Name as name 
              FROM CartItems c
              LEFT JOIN DishMaster d ON c.ProductId = d.DishId
              WHERE c.CartId = @cartId
            `);
          
          const transaction = new sql.Transaction(bgPool);
          await transaction.begin();
          try {
            await syncToProfessionalTables(transaction, cleanId, currentOrderId, cartItemsRes.recordset, userId);
            await transaction.commit();
            console.log(`✨ [Send-Background] Synced ${cartItemsRes.recordset.length} items to professional for Table ${cleanId}`);
          } catch (err) {
            await transaction.rollback();
            console.error("❌ [Send-Background] Sync Error:", err);
          }
        } catch (e) {
          console.error("❌ [Send-Background] Fetch Error:", e);
        }
      })();

      const updated = await syncTableStatus(req, tableId);
      return res.json({ success: true, currentOrderId, ...updated });
    } else {
      // 1. Mark items as SENT in CartItems
      await pool.request()
        .input("orderId", sql.NVarChar(50), currentOrderId)
        .input("ModifiedBy", sql.UniqueIdentifier, userId || null)
        .query("UPDATE CartItems SET OrderNo = @orderId, DateCreated = GETDATE(), Status = 'SENT', ModifiedBy = @ModifiedBy WHERE (OrderNo = @orderId OR OrderNo = 'PENDING' OR OrderNo IS NULL) AND (Status = 'NEW' OR Status IS NULL)");

      // 2. 🚀 BACKGROUND SYNC FOR TAKEAWAY: Fetch items by orderId and sync to professional (Non-blocking)
      (async () => {
        try {
          const bgPool = await poolPromise;
          const cartItemsRes = await bgPool.request()
            .input("orderId", sql.NVarChar(50), currentOrderId)
            .query(`
              SELECT c.*, d.Name as name 
              FROM CartItems c
              LEFT JOIN DishMaster d ON c.ProductId = d.DishId
              WHERE c.OrderNo = @orderId
            `);
          
          const transaction = new sql.Transaction(bgPool);
          await transaction.begin();
          try {
            await syncToProfessionalTables(transaction, currentOrderId, currentOrderId, cartItemsRes.recordset, userId);
            await transaction.commit();
            console.log(`✨ [Send-Background] Synced Takeaway ${currentOrderId} to professional KDS`);
          } catch (err) {
            await transaction.rollback();
            console.error("❌ [Send-Background] Takeaway Sync Error:", err);
          }
        } catch (e) {
          console.error("❌ [Send-Background] Fetch Error:", e);
        }
      })();

      return res.json({ success: true, currentOrderId });
    }
  } catch (err) {
    console.error("❌ [Send Order] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Hold Order
router.post("/hold", async (req, res) => {
  try {
    const { tableId } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    // Use syncTableStatus which updates both Status (to 3) and TotalAmount
    const pool = await poolPromise;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();
    
    await pool.request()
      .input("tableId", sql.NVarChar(128), cleanId)
      .input("ModifiedBy", sql.UniqueIdentifier, userId || null)
      .query("UPDATE TableMaster SET Status = 3, ModifiedBy = @ModifiedBy WHERE TableId = @tableId");

    const updated = await syncTableStatus(req, tableId);
    res.json({ success: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Checkout (Bill Requested)
router.post("/checkout", async (req, res) => {
  try {
    const { tableId } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    const pool = await poolPromise;
    const cleanId = String(tableId).replace(/^\{|\}$/g, "").trim();

    await pool.request()
      .input("tableId", sql.NVarChar(128), cleanId)
      .input("ModifiedBy", sql.UniqueIdentifier, userId || null)
      .query("UPDATE TableMaster SET Status = 2, ModifiedBy = @ModifiedBy WHERE TableId = @tableId");

    // Also mark all NEW items as SENT when checking out, so they are officially part of the bill
    await pool.request()
      .input("cartId", sql.NVarChar(128), cleanId)
      .query("UPDATE CartItems SET Status = 'SENT' WHERE CartId = @cartId AND (Status = 'NEW' OR Status IS NULL)");

    const updated = await syncTableStatus(req, tableId);
    res.json({ success: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Complete / Payment -> Available
router.post("/complete", async (req, res) => {
  try {
    const { tableId } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    if (!tableId) return res.status(400).json({ error: "TableId is required" });

    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();
    const pool = await poolPromise;

    await pool.request()
      .input("cartId", sql.NVarChar(sql.MAX), cleanId)
      .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @cartId");

    await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .input("ModifiedBy", sql.UniqueIdentifier, userId || null)
      .query("UPDATE TableMaster SET Status = 0, TotalAmount = 0, StartTime = NULL, CurrentOrderId = NULL, ModifiedBy = @ModifiedBy WHERE TableId = @tid");

    if (io) {
      io.emit("table_status_updated", { tableId: cleanId, status: 0, totalAmount: 0, startTime: null });
      io.emit("cart_updated", { tableId: cleanId });
    }
    res.json({ success: true, status: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Save Cart Items Persistent (Consolidated Atomic Version)
router.post("/save-cart", async (req, res) => {
  try {
    const { tableId, orderId, items } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    const pool = await poolPromise;
    const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();

    console.log(`📥 [CartSave] Atomic Sync Start: Table ${cleanTableId} | Items: ${items?.length}`);

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      // 1. Resolve Order ID
      const currentOrderId = orderId || await getOrGenerateOrderId(req, cleanTableId);

      // 2. Identify incoming item IDs to avoid deleting them
      const incomingItemIds = (items || []).map(it => it.lineItemId || it.ItemId).filter(Boolean);

      // 3. Delete ONLY NEW items that are NO LONGER in the frontend list
      if (incomingItemIds.length > 0) {
        await transaction.request()
          .input("cartId", sql.NVarChar(128), cleanTableId)
          .query(`
            DELETE FROM [dbo].[CartItems] 
            WHERE [CartId] = @cartId 
            AND (Status = 'NEW' OR Status IS NULL)
            AND ItemId NOT IN ('${incomingItemIds.join("','")}')
          `);
      } else {
        // If list is empty, clear all NEW items
        await transaction.request()
          .input("cartId", sql.NVarChar(128), cleanTableId)
          .query("DELETE FROM [dbo].[CartItems] WHERE [CartId] = @cartId AND (Status = 'NEW' OR Status IS NULL)");
      }

      // 4. Upsert Items to CartItems
      if (items && items.length > 0) {
        for (const item of items) {
          const noteInfo = resolveItemNote(item);
          const takeawayInfo = resolveItemTakeaway(item);
          const newItemId = item.lineItemId || item.ItemId || require("crypto").randomUUID();
          
          // Use frontend date if available, else current date
          const dateCreated = item.DateCreated || new Date().toISOString();

          await transaction.request()
            .input("itemId", sql.UniqueIdentifier, newItemId)
            .input("cartId", sql.NVarChar(128), cleanTableId)
            .input("productId", sql.NVarChar(128), String(item.id || item.ProductId))
            .input("qty", sql.Int, item.qty || 1)
            .input("cost", sql.Decimal(18, 2), item.price || item.Cost || 0)
            .input("orderNo", sql.NVarChar(50), currentOrderId)
            .input("isTakeaway", sql.Bit, takeawayInfo.value ? 1 : 0)
            .input("isVoided", sql.Bit, item.isVoided ? 1 : 0)
            .input("discountAmount", sql.Decimal(18, 2), item.discount || item.DiscountAmount || 0)
            .input("discountType", sql.NVarChar(20), "percentage")
            .input("note", sql.NVarChar(sql.MAX), noteInfo.value)
            .input("modifiersJSON", sql.NVarChar(sql.MAX), JSON.stringify(item.modifiers || []))
            .input("spicy", sql.NVarChar(50), item.spicy || "")
            .input("salt", sql.NVarChar(50), item.salt || "")
            .input("oil", sql.NVarChar(50), item.oil || "")
            .input("sugar", sql.NVarChar(50), item.sugar || "")
            .input("status", sql.NVarChar(20), item.status || "NEW")
            .input("userId", sql.UniqueIdentifier, userId || null)
            .input("dateCreated", sql.DateTime, new Date(dateCreated))
            .query(`
               IF EXISTS (SELECT 1 FROM CartItems WHERE ItemId = @itemId)
               BEGIN
                 UPDATE CartItems SET 
                   Quantity = @qty, Cost = @cost, Note = @note, 
                   IsTakeaway = @isTakeaway, IsVoided = @isVoided, 
                   ModifiersJSON = @modifiersJSON,
                   Status = @status,
                   DiscountAmount = @discountAmount,
                   Spicy = @spicy, Salt = @salt, Oil = @oil, Sugar = @sugar,
                   OrderNo = @orderNo
                 WHERE ItemId = @itemId
               END
               ELSE
               BEGIN
                 INSERT INTO [dbo].[CartItems] 
                 (ItemId, CartId, ProductId, Quantity, Cost, OrderNo, OrderConfirmQty, DateCreated, 
                  IsTakeaway, IsVoided, Note, ModifiersJSON, Spicy, Salt, Oil, Sugar, Status, DiscountAmount, DiscountType, CreatedBy)
                 VALUES 
                 (@itemId, @cartId, @productId, @qty, @cost, @orderNo, @qty, @dateCreated, 
                  @isTakeaway, @isVoided, @note, @modifiersJSON, @spicy, @salt, @oil, @sugar, @status, @discountAmount, @discountType, @userId)
               END
             `);
        }

        // 5. Update Table Header Status
        const isOrderTakeaway = items.some(it => resolveItemTakeaway(it).value);
        await transaction.request()
          .input("tableId", sql.UniqueIdentifier, cleanTableId)
          .input("isTakeaway", sql.Bit, isOrderTakeaway ? 1 : 0)
          .query(`
            UPDATE TableMaster 
            SET Status = 1, 
                IstakeAway = @isTakeaway, 
                StartTime = CASE WHEN StartTime IS NULL OR StartTime < '2000-01-01' THEN GETDATE() ELSE StartTime END, 
                ModifiedOn = GETDATE() 
            WHERE TableId = @tableId
          `);
      } else {
        // If items are empty, reset table to Available
        await transaction.request()
          .input("tableId", sql.UniqueIdentifier, cleanTableId)
          .query("UPDATE TableMaster SET Status = 0, StartTime = NULL, CurrentOrderId = NULL, IstakeAway = 0 WHERE TableId = @tableId");
      }

      // 6. PROFESSIONAL SYNC: Move data to legacy/KDS tables
      await syncToProfessionalTables(transaction, cleanTableId, currentOrderId, items || [], userId);

      await transaction.commit();

      // 7. ASYNC NOTIFICATIONS & RECALC
      const io = req.app.get("io");
      if (io) {
        io.emit("cart_updated", { tableId: cleanTableId });
        io.emit("table_status_updated", { tableId: cleanTableId, status: (items && items.length > 0) ? 1 : 0 });
      }
      
      // Background recalculate total and notify clients
      syncTableStatus(req, cleanTableId).catch(err => console.error("Sync Error:", err));

      console.log(`✅ [SaveCart] Sync Complete for Table ${cleanTableId}`);
      res.json({ success: true, orderId: currentOrderId });
    } catch (err) {
      console.error("❌ [SaveCart] ROLLBACK:", err.message);
      await transaction.rollback();
      res.status(500).json({ error: err.message });
    }
  } catch (err) {
    console.error("❌ [SaveCart] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Add Single Item and Sync
router.post("/add-item", async (req, res) => {
  try {
    const { tableId, orderId, item } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    const providedItemId = item.lineItemId || item.itemId || item.ItemId || require("crypto").randomUUID();
    
    const pool = await poolPromise;
    const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();
    const cleanProdId = String(item.id).replace(/^\{|\}$/g, "").trim();
    const cleanOrderNo = String(orderId || "PENDING").replace(/^\{|\}$/g, "").trim();

    const noteInfo = resolveItemNote(item || {});
    const takeawayInfo = resolveItemTakeaway(item || {});
    const spicyInfo = resolveItemSpicy(item || {});
    const saltInfo = resolveItemSalt(item || {});
    const oilInfo = resolveItemOil(item || {});
    const sugarInfo = resolveItemSugar(item || {});

    const result = await pool.request()
      .input("itemId", sql.UniqueIdentifier, providedItemId)
      .input("cartId", sql.NVarChar(128), cleanTableId)
      .input("productId", sql.NVarChar(128), cleanProdId)
      .input("qty", sql.Int, item.qty || 1)
      .input("cost", sql.Decimal(18, 2), item.price || 0)
      .input("note", sql.NVarChar(sql.MAX), noteInfo.value)
      .input("modifiersJSON", sql.NVarChar(sql.MAX), JSON.stringify(item.modifiers || []))
      .input("isTakeaway", sql.Bit, takeawayInfo.value ? 1 : 0)
      .input("spicy", sql.NVarChar(50), spicyInfo.value)
      .input("salt", sql.NVarChar(50), saltInfo.value)
      .input("oil", sql.NVarChar(50), oilInfo.value)
      .input("sugar", sql.NVarChar(50), sugarInfo.value)
      .input("status", sql.NVarChar(20), "NEW")
      .input("userId", sql.UniqueIdentifier, userId || null)
      .query(`
        BEGIN TRANSACTION;
        BEGIN TRY
          IF EXISTS (
            SELECT 1 FROM [dbo].[CartItems] WITH (UPDLOCK, HOLDLOCK)
            WHERE CartId = @cartId 
              AND ProductId = @productId 
              AND Status = @status
              AND IsTakeaway = @isTakeaway
              AND ISNULL(Spicy, '') = ISNULL(@spicy, '')
              AND ISNULL(Salt, '') = ISNULL(@salt, '')
              AND ISNULL(Oil, '') = ISNULL(@oil, '')
              AND ISNULL(Sugar, '') = ISNULL(@sugar, '')
              AND (ModifiersJSON = @modifiersJSON OR (ModifiersJSON IS NULL AND @modifiersJSON = '[]'))
              AND (Note = @note OR (Note IS NULL AND @note = ''))
          )
          BEGIN
            UPDATE [dbo].[CartItems] 
            SET Quantity = Quantity + @qty, 
                OrderConfirmQty = ISNULL(OrderConfirmQty, 0) + @qty
            OUTPUT INSERTED.ItemId
            WHERE CartId = @cartId 
              AND ProductId = @productId 
              AND Status = @status
              AND IsTakeaway = @isTakeaway
              AND ISNULL(Spicy, '') = ISNULL(@spicy, '')
              AND ISNULL(Salt, '') = ISNULL(@salt, '')
              AND ISNULL(Oil, '') = ISNULL(@oil, '')
              AND ISNULL(Sugar, '') = ISNULL(@sugar, '')
              AND (ModifiersJSON = @modifiersJSON OR (ModifiersJSON IS NULL AND @modifiersJSON = '[]'))
              AND (Note = @note OR (Note IS NULL AND @note = ''));
          END
          ELSE
          BEGIN
            INSERT INTO [dbo].[CartItems] 
            (ItemId, CartId, ProductId, Quantity, Cost, OrderNo, OrderConfirmQty, DateCreated, Status, Note, ModifiersJSON, IsTakeaway, CreatedBy)
            OUTPUT INSERTED.ItemId
            VALUES 
            (@itemId, @cartId, @productId, @qty, @cost, 'PENDING', @qty, GETDATE(), @status, @note, @modifiersJSON, @isTakeaway, @userId);
          END
          COMMIT TRANSACTION;
        END TRY
        BEGIN CATCH
          ROLLBACK TRANSACTION;
          THROW;
        END CATCH
      `);

    const savedItemId = result.recordset[0]?.ItemId;

    // 🚀 SYNC TO PROFESSIONAL TABLES
    const cartItemsRes = await pool.request()
      .input("cartId", sql.NVarChar(128), cleanTableId)
      .query("SELECT * FROM CartItems WHERE CartId = @cartId");
    
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await syncToProfessionalTables(transaction, cleanTableId, orderId, cartItemsRes.recordset, userId);
      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      console.error("AddItem Sync Error:", err);
    }

    const updated = await syncTableStatus(req, cleanTableId);
    console.log(`✅ [AddItem] Success: Table ${cleanTableId}, Item ${cleanProdId}`);
    
    const io = req.app.get("io");
    if (io) {
      io.emit("cart_updated", { tableId: cleanTableId });
    }

    res.json({ success: true, ItemId: savedItemId, ...updated });
  } catch (err) {
    console.error("❌ [AddItem] ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Remove/Void Item (Supports Partial Voiding)
router.post("/remove-item", async (req, res) => {
  try {
    const { tableId, productId, itemId, qtyToVoid, reason } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    const pool = await poolPromise;
    const cleanTableId = String(tableId).replace(/^\{|\}$/g, "").trim();

    if (!itemId) {
       // Original behavior for NEW items by ProductId
       await pool.request()
        .input("cartId", sql.NVarChar(128), cleanTableId)
        .input("prodId", sql.NVarChar(128), productId)
        .query("DELETE FROM CartItems WHERE CartId = @cartId AND ProductId = @prodId AND Status = 'NEW'");
       return res.json({ success: true });
    }

    // 1. Fetch current item details
    const itemResult = await pool.request()
      .input("itemId", sql.NVarChar(128), itemId)
      .query("SELECT * FROM CartItems WHERE ItemId = @itemId");
    
    const item = itemResult.recordset[0];
    if (!item) return res.status(404).json({ error: "Item not found" });

    const currentQty = item.Quantity;
    const voidQty = qtyToVoid || currentQty; // Default to all

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      if (voidQty < currentQty) {
        // PROFESSIONAL PARTIAL VOID: Split the line item
        // a) Create the VOIDED portion
        await transaction.request()
          .input("parentItemId", sql.NVarChar(128), itemId)
          .input("voidQty", sql.Int, voidQty)
          .input("userId", sql.UniqueIdentifier, userId || null)
          .input("reason", sql.NVarChar(255), reason || "")
          .query(`
            INSERT INTO [dbo].[CartItems] 
            (ItemId, CartId, ProductId, Quantity, Cost, OrderNo, OrderConfirmQty, DateCreated, 
             IsTakeaway, IsVoided, Note, ModifiersJSON, Spicy, Salt, Oil, Sugar, Status, DiscountAmount, DiscountType, CreatedBy)
            SELECT 
              NEWID(), CartId, ProductId, @voidQty, Cost, OrderNo, @voidQty, GETDATE(), 
              IsTakeaway, 1, 
              CASE WHEN @reason <> '' THEN ISNULL(Note, '') + ' (VOID REASON: ' + @reason + ')' ELSE Note END, 
              ModifiersJSON, Spicy, Salt, Oil, Sugar, 'VOIDED', DiscountAmount, DiscountType, @userId
            FROM CartItems WHERE ItemId = @parentItemId
          `);

        // b) Update original item with reduced quantity
        await transaction.request()
          .input("itemId", sql.NVarChar(128), itemId)
          .input("newQty", sql.Int, currentQty - voidQty)
          .query("UPDATE CartItems SET Quantity = @newQty, OrderConfirmQty = @newQty WHERE ItemId = @itemId");

      } else {
        // ✅ NEW logic: If item is NEW, DELETE it. If already SENT/READY, VOID it.
        if (item.Status === 'NEW' || !item.Status) {
          await transaction.request()
            .input("itemId", sql.NVarChar(128), itemId)
            .query("DELETE FROM CartItems WHERE ItemId = @itemId");
          console.log(`🗑️ [RemoveItem] Hard deleted NEW item: ${itemId}`);
        } else {
          await transaction.request()
            .input("itemId", sql.NVarChar(128), itemId)
            .input("userId", sql.UniqueIdentifier, userId || null)
            .input("reason", sql.NVarChar(255), reason || "")
            .query(`
              UPDATE CartItems 
              SET Status = 'VOIDED', 
                  IsVoided = 1, 
                  ModifiedBy = @userId,
                  Note = CASE WHEN @reason <> '' THEN ISNULL(Note, '') + ' (VOID REASON: ' + @reason + ')' ELSE Note END
              WHERE ItemId = @itemId
            `);
          console.log(`🚫 [RemoveItem] Voided SENT item: ${itemId}`);
        }
      }

      await transaction.commit();
    } catch (err) {
      await transaction.rollback();
      throw err;
    }

    const updated = await syncTableStatus(req, cleanTableId);
    
    const io = req.app.get("io");
    if (io) {
      io.emit("cart_updated", { tableId: cleanTableId });
    }

    res.json({ success: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Update Individual Item Status (READY, SERVED, etc.)
router.post("/update-item-status", async (req, res) => {
  try {
    const { orderId, lineItemId, status } = req.body;
    const userId = req.body.userId || req.body.UserId || req.body.USERID;
    if (!lineItemId || !status) return res.status(400).json({ error: "Missing parameters" });

    const pool = await poolPromise;
    
    // 1. Update CartItems
    const result = await pool.request()
      .input("itemId", sql.NVarChar(128), lineItemId)
      .input("status", sql.NVarChar(20), status)
      .input("userId", sql.UniqueIdentifier, userId || null)
      .query("UPDATE CartItems SET Status = @status, ModifiedBy = @userId OUTPUT INSERTED.CartId WHERE ItemId = @itemId");

    const tableId = result.recordset[0]?.CartId;

    // 2. Update Professional KDS Table (RestaurantOrderDetailCur)
    // The KDS polls from this table, so if we don't update it, it will revert!
    const statusCodes = { 'NEW': 1, 'SENT': 2, 'READY': 3, 'SERVED': 4, 'HOLD': 5, 'VOIDED': 0 };
    const numericStatus = statusCodes[status] !== undefined ? statusCodes[status] : 2;

    await pool.request()
      .input("detailId", sql.UniqueIdentifier, lineItemId)
      .input("statusCode", sql.Int, numericStatus)
      .input("userId", sql.UniqueIdentifier, userId || '00000000-0000-0000-0000-000000000000')
      .query("UPDATE RestaurantOrderDetailCur SET StatusCode = @statusCode, ModifiedBy = @userId, ModifiedOn = GETDATE() WHERE OrderDetailId = @detailId");

    // 3. Sync to professional tables via helper
    if (tableId) {
      await syncTableStatus(req, tableId);
    }

    const io = req.app.get("io");
    if (io) {
      console.log(`📢 [Socket] Broadcasting status update for Table ${tableId}: ${lineItemId} -> ${status}`);
      io.emit("item_status_updated", { orderId, lineItemId, status, tableId });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("❌ [UpdateStatus] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Sync Manual Trigger
router.post("/sync/:tableId", async (req, res) => {
  try {
    const updated = await syncTableStatus(req, req.params.tableId);
    res.json({ success: true, ...updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Fetch All Active Kitchen Orders (For KDS/Kitchen Status Sync)
router.get("/active-kitchen", async (req, res) => {
  try {
    const pool = await poolPromise;
    
    // PROFESSIONAL QUERY: Using RestaurantOrderDetailCur instead of CartItems
    const result = await pool.request().query(`
      SELECT 
        d.OrderDetailId as ItemId,
        h.OrderId as CartId,
        d.DishId as ProductId,
        d.Quantity,
        d.StatusCode,
        d.ActualAmount as TotalLineAmount,
        h.OrderNumber as OrderNo,
        COALESCE(NULLIF(d.Remarks, ''), NULLIF(ci.Note, ''), '') as Note,
        d.Spicy, d.Salt, d.Oil, d.Sugar,
        DATEDIFF(SECOND, d.CreatedOn, GETDATE()) as elapsedSeconds,
        dish.Name as name, 
        dish.CurrentCost as price,
        cat.CategoryName as categoryName,
        dg.DishGroupName as dishGroupName,
        ckt.KitchenTypeCode,
        ISNULL(ckt.KitchenTypeName, cat.CategoryName) as KitchenTypeName,
        pm.PrinterPath as PrinterIP,
        h.Tableno as tableNo,
        ISNULL(d.isTakeAway, ci.IsTakeaway) as isTakeaway,
        t.DiningSection as section,
        t.TableId as tableId,
        h.OrderNumber as tableOrderId,
        -- Fetch Modifiers as a JSON string for frontend compatibility
        (SELECT 
            m.ModifierId, 
            ISNULL(mm.ModifierName, m.ModifierName) as ModifierName, 
            m.Quantity as qty, 
            m.Amount as price
         FROM RestaurantmodifierdetailCur m 
         LEFT JOIN ModifierMaster mm ON m.ModifierId = mm.ModifierId
         WHERE m.OrderDetailId = d.OrderDetailId 
         FOR JSON PATH) as ModifiersJSON
      FROM [dbo].[RestaurantOrderDetailCur] d
      INNER JOIN [dbo].[RestaurantOrderCur] h ON d.OrderId = h.OrderId
      LEFT JOIN [dbo].[CartItems] ci ON CAST(ci.ItemId AS NVARCHAR(128)) = CAST(d.OrderDetailId AS NVARCHAR(128))
      LEFT JOIN [dbo].[DishMaster] dish ON d.DishId = dish.DishId
      LEFT JOIN [dbo].[DishGroupMaster] dg ON dish.DishGroupId = dg.DishGroupId
      LEFT JOIN [dbo].[CategoryMaster] cat ON dg.CategoryId = cat.CategoryId
      LEFT JOIN [dbo].[CategoryKitchenType] ckt ON dg.CategoryId = ckt.CategoryId
      LEFT JOIN [dbo].[PrintMaster] pm ON TRY_CAST(ckt.KitchenTypeCode AS INT) = pm.KitchenTypeValue
      LEFT JOIN [dbo].[TableMaster] t ON UPPER(LTRIM(RTRIM(h.Tableno))) = 'T' + UPPER(LTRIM(RTRIM(CAST(t.TableId AS NVARCHAR(50)))))
                                      OR h.Tableno = CAST(t.TableNumber AS NVARCHAR(50))
      WHERE d.StatusCode IN (2, 3, 4, 5) 
      -- 1:NEW, 2:SENT, 3:READY, 4:SERVED, 5:HOLD
      AND h.isOrderClosed = 0
      ORDER BY d.CreatedOn ASC
    `);

    // Group items by OrderNo or tableOrderId
    const ordersMap = new Map();

    result.recordset.forEach(row => {
      // Prioritize the professional tableOrderId (from TableMaster) over the internal OrderNo
      const orderId = row.tableOrderId || (row.OrderNo && row.OrderNo !== 'PENDING' ? row.OrderNo : row.CartId);
      if (!orderId) return;

      if (!ordersMap.has(orderId)) {
        ordersMap.set(orderId, {
          orderId,
          context: {
            tableNo: row.tableNo || "TAKEAWAY",
            section: row.section || "TAKEAWAY",
            orderType: row.tableNo ? "DINE_IN" : "TAKEAWAY",
            takeawayNo: row.OrderNo,
            tableId: row.tableId,
            tableOrderId: row.tableOrderId,
          },
          items: [],
          createdAt: Date.now() - ((row.elapsedSeconds || 0) * 1000)
        });
      }

      const order = ordersMap.get(orderId);
      // Map professional StatusCode back to string for frontend compatibility
      const statusMap = { 1: 'NEW', 2: 'SENT', 3: 'READY', 4: 'SERVED', 5: 'HOLD' };
      const statusStr = statusMap[row.StatusCode] || 'SENT';

      order.items.push({
        id: row.ProductId,
        lineItemId: row.ItemId,
        qty: row.Quantity,
        name: row.name || "Unknown",
        categoryName: row.categoryName || "OTHERS",
        dishGroupName: row.dishGroupName || "",
        price: row.price || row.TotalLineAmount,
        status: statusStr,
        elapsedSeconds: row.elapsedSeconds || 0,
        sentAt: Date.now() - ((row.elapsedSeconds || 0) * 1000),
        modifiers: (() => {
          try {
            return row.ModifiersJSON ? JSON.parse(row.ModifiersJSON) : [];
          } catch (e) {
            console.error("❌ [ActiveKitchen] JSON Parse Error for Item:", row.ItemId, e);
            return [];
          }
        })(),
        isTakeaway: row.isTakeaway === true || row.isTakeaway === 1 || row.IsTakeaway === true || row.IsTakeaway === 1,
        isVoided: row.StatusCode === 0, // Assuming 0 or another code is void
        note: row.Note ?? row.note ?? row.Remarks ?? "",
        spicy: row.Spicy,
        salt: row.Salt,
        oil: row.Oil,
        sugar: row.Sugar,
        KitchenTypeCode: row.KitchenTypeCode,
        KitchenTypeName: row.KitchenTypeName,
        PrinterIP: row.PrinterIP
      });
    });

    res.json({
      serverTime: new Date().getTime(),
      orders: Array.from(ordersMap.values())
    });
  } catch (err) {
    console.error("❌ [ActiveKitchen] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Fetch Cart Items Persistent
router.get("/cart/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    const pool = await poolPromise;
    const cleanId = tableId.replace(/^\{|\}$/g, "").trim();

    console.log(`🔍 [CartFetch] Fetching for Table: ${cleanId}`);

    const result = await pool.request()
      .input("cartId", sql.NVarChar(sql.MAX), cleanId)
      .query(`
        SELECT c.ItemId, c.CartId, c.ProductId, c.Quantity, c.Status, c.Cost, c.OrderNo, c.ModifiersJSON, c.IsTakeaway, c.IsVoided,
        c.Note,
        c.DiscountAmount, c.DiscountType,
        CONVERT(VARCHAR, c.DateCreated, 126) as DateCreated,
        c.Spicy, c.Salt, c.Oil, c.Sugar,
        d.Name as name, d.CurrentCost as price,
        ckt.KitchenTypeCode, 
        ISNULL(ckt.KitchenTypeName, cat.CategoryName) as KitchenTypeName,
        pm.PrinterPath as PrinterIP
        FROM [dbo].[CartItems] c
        LEFT JOIN [dbo].[DishMaster] d ON CAST(c.ProductId AS NVARCHAR(128)) = CAST(d.DishId AS NVARCHAR(128))
        LEFT JOIN [dbo].[DishGroupMaster] dgm ON d.DishGroupId = dgm.DishGroupId
        LEFT JOIN [dbo].[CategoryMaster] cat ON dgm.CategoryId = cat.CategoryId
        LEFT JOIN [dbo].[CategoryKitchenType] ckt ON dgm.CategoryId = ckt.CategoryId
        LEFT JOIN [dbo].[PrintMaster] pm ON CAST(ckt.KitchenTypeCode AS INT) = pm.KitchenTypeValue
        WHERE c.CartId = @cartId
        ORDER BY c.DateCreated ASC
      `);

    // Parse JSON and flags for frontend
    const items = result.recordset.map(item => ({
      ...item,
      id: item.ProductId,
      lineItemId: item.ItemId,
      qty: item.Quantity,
      name: item.name,
      price: item.price || item.Cost,
      status: item.Status || "NEW",
      modifiers: item.ModifiersJSON ? JSON.parse(item.ModifiersJSON) : [],
      isTakeaway: !!item.IsTakeaway,
      isVoided: !!item.IsVoided,
      note: item.Note,
      spicy: item.Spicy,
      salt: item.Salt,
      oil: item.Oil,
      sugar: item.Sugar,
      discount: item.DiscountAmount || 0,
      DiscountAmount: item.DiscountAmount || 0,
      KitchenTypeCode: item.KitchenTypeCode,
      KitchenTypeName: item.KitchenTypeName,
      PrinterIP: item.PrinterIP
    }));

    const tableInfo = await pool.request()
      .input("tid", sql.UniqueIdentifier, cleanId)
      .query("SELECT CurrentOrderId FROM TableMaster WHERE TableId = @tid");

    res.json({ 
      items, 
      currentOrderId: tableInfo.recordset[0]?.CurrentOrderId || null 
    });
  } catch (err) {
    console.error("❌ [CartFetch] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ Debug Schema
router.get("/debug-schema", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'CartItems'
    `);
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ Log Print Action
router.post("/log-print", async (req, res) => {
  try {
    const { orderId, orderNumber, printType, isEdit, isReprint, isHold } = req.body;
    const pool = await poolPromise;
    
    // Validate orderId is a GUID or find the internal GUID if it's a display ID
    let finalOrderId = orderId;
    if (orderId && !orderId.includes("-")) {
      // If it's a display ID, we try to find the matching TableMaster entry or similar
      // But usually, PrintReport expects the UniqueIdentifier OrderId
      // For now, if it's not a GUID, we might need to handle it or skip it
    }

    await pool.request()
      .input("orderId", sql.UniqueIdentifier, finalOrderId && finalOrderId.length > 20 ? finalOrderId : null)
      .input("orderNumber", sql.VarChar(50), orderNumber)
      .input("printType", sql.Int, printType || 1) // 1 = KOT
      .input("orderDate", sql.DateTime, new Date())
      .input("isEdit", sql.Bit, isEdit ? 1 : 0)
      .input("isReprint", sql.Bit, isReprint ? 1 : 0)
      .input("isHold", sql.Bit, isHold ? 1 : 0)
      .query(`
        INSERT INTO PrintReport (OrderId, Ordernumber, PrintType, orderDate, isEditOrder, isReprint, isHold)
        VALUES (@orderId, @orderNumber, @printType, @orderDate, @isEdit, @isReprint, @isHold)
      `);

    res.json({ success: true });
  } catch (err) {
    console.error("❌ [LogPrint] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * Cancel Full Order
 * Updates SettlementHeader, SettlementItemDetail, TableMaster, CartItems, and Professional tables
 */
router.post("/cancel", async (req, res) => {
  const { orderId, tableId, reason, userId } = req.body;
  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  console.log(`🗑️ [CancelOrder] Attempting to cancel Order: ${orderId}, Table: ${tableId}`);

  try {
    await transaction.begin();

    // 1. Update SettlementHeader
    const headerUpdate = await transaction.request()
      .input("orderId", sql.NVarChar(50), orderId)
      .input("reason", sql.NVarChar(255), reason)
      .input("userId", sql.NVarChar(128), userId)
      .query(`
        UPDATE SettlementHeader 
        SET IsCancelled = 1, 
            CancellationReason = @reason, 
            CancelledBy = @userId, 
            CancelledDate = GETDATE() 
        WHERE BillNo = @orderId OR CAST(SettlementID AS NVARCHAR(50)) = @orderId;
        
        SELECT @@ROWCOUNT AS RowsUpdated;
        SELECT TOP 1 SettlementID, BillNo, TableNo, [Section], SysAmount FROM SettlementHeader WHERE BillNo = @orderId OR CAST(SettlementID AS NVARCHAR(50)) = @orderId;
      `);

    let settlementHeader = headerUpdate.recordsets[1][0];
    let settlementId = settlementHeader?.SettlementID;
    const rowsUpdated = headerUpdate.recordsets[0][0].RowsUpdated;

    // 1b. If not found in SettlementHeader, it might be an active order.
    // Create a record so it shows in Sales Report.
    if (rowsUpdated === 0) {
      console.log(`📝 [CancelOrder] Order not in SettlementHeader. Creating placeholder...`);
      
      // Fetch details from TableMaster/CartItems to create header
      const tableData = await transaction.request()
        .input("oid", sql.NVarChar(50), orderId)
        .input("tid", sql.NVarChar(128), tableId || "")
        .query(`
          SELECT TOP 1 TableId, TableNumber, DiningSection AS [Section], TotalAmount, CurrentOrderId, StartTime 
          FROM TableMaster 
          WHERE CurrentOrderId = @oid OR TableId = @tid OR TableNumber = @tid;
        `);

      const tInfo = tableData.recordset[0];
      if (tInfo) {
        const newSid = require('crypto').randomUUID();
        
        await transaction.request()
          .input("sid", sql.UniqueIdentifier, newSid)
          .input("orderId", sql.NVarChar(50), orderId || tInfo.CurrentOrderId || "CANCELLED")
          .input("tno", sql.NVarChar(50), tInfo.TableNumber)
          .input("sec", sql.NVarChar(100), tInfo.Section)
          .input("amt", sql.Money, tInfo.TotalAmount || 0)
          .input("reason", sql.NVarChar(255), reason)
          .input("userId", sql.NVarChar(128), userId)
          .input("tid", sql.NVarChar(128), tableId || "")
          .input("oid", sql.NVarChar(50), orderId || "")
          .query(`
            INSERT INTO SettlementHeader (
              SettlementID, LastSettlementDate, BillNo, OrderType, TableNo, [Section], 
              SubTotal, TotalTax, DiscountAmount, SysAmount, ManualAmount, 
              IsCancelled, CancellationReason, CancelledBy, CancelledDate,
              CreatedBy, CreatedOn
            ) VALUES (
              @sid, GETDATE(), @orderId, 'DINE-IN', @tno, @sec, 
              @amt, 0, 0, @amt, @amt, 
              1, @reason, @userId, GETDATE(),
              @userId, GETDATE()
            );

            INSERT INTO SettlementTotalSales (SettlementID, PayMode, SysAmount, ManualAmount, AmountDiff, ReceiptCount)
            VALUES (@sid, 'CASH', @amt, @amt, 0, 0);

            -- 3. Copy items from CartItems to SettlementItemDetail so reports work
            INSERT INTO SettlementItemDetail (SettlementID, DishId, DishName, Qty, Price, Status, OrderDateTime)
            SELECT @sid, ci.ProductId, ISNULL(d.Name, 'Unknown'), ci.Quantity, ci.Cost, 'CANCELLED', GETDATE()
            FROM CartItems ci
            LEFT JOIN DishMaster d ON CAST(ci.ProductId AS NVARCHAR(128)) = CAST(d.DishId AS NVARCHAR(128))
            WHERE ci.CartId = @tid OR ci.OrderNo = @oid;
          `);
        
        settlementId = newSid;
        settlementHeader = { SettlementID: newSid, BillNo: orderId, TableNo: tInfo.TableNumber, Section: tInfo.Section };
      }
    }

    if (settlementId) {
      // 2. Update SettlementItemDetail
      await transaction.request()
        .input("sid", sql.UniqueIdentifier, settlementId)
        .query("UPDATE SettlementItemDetail SET Status = 'CANCELLED' WHERE SettlementID = @sid");
        
      // 3. Update RestaurantInvoice (Professional Table)
      await transaction.request()
        .input("rid", sql.UniqueIdentifier, settlementId)
        .query("UPDATE RestaurantInvoice SET StatusCode = 4 WHERE RestaurantBillId = @rid");
    }

    // 4. Handle Active Table Reset (if tableId or orderId is provided)
    let targetTableId = tableId;
    if (!targetTableId && settlementHeader?.TableNo) {
       // Try to find tableId by TableNumber if not provided
       const tCheck = await transaction.request()
         .input("tno", sql.NVarChar(50), settlementHeader.TableNo)
         .query("SELECT TableId FROM TableMaster WHERE TableNumber = @tno");
       if (tCheck.recordset.length > 0) {
          targetTableId = tCheck.recordset[0].TableId;
       }
    }

    if (targetTableId) {
      const cleanTableId = String(targetTableId).replace(/^\{|\}$/g, "").trim();
      
      // Update TableMaster
      await transaction.request()
        .input("tid", sql.UniqueIdentifier, cleanTableId)
        .query(`
          UPDATE TableMaster 
          SET Status = 0, 
              TotalAmount = 0, 
              StartTime = NULL, 
              CurrentOrderId = NULL, 
              ModifiedOn = GETDATE() 
          WHERE TableId = @tid
        `);

      // Clear CartItems
      await transaction.request()
        .input("tid", sql.NVarChar(128), cleanTableId)
        .query("DELETE FROM CartItems WHERE CartId = @tid");
    }

    // Always clear CartItems by OrderNo to be safe
    if (orderId) {
       await transaction.request()
        .input("oid", sql.NVarChar(50), orderId)
        .query("DELETE FROM CartItems WHERE OrderNo = @oid");
    }

    // 5. Professional Active Order Sync (RestaurantOrderCur / RestaurantOrderDetailCur)
    await transaction.request()
      .input("oid", sql.NVarChar(50), orderId)
      .query(`
        -- Mark header as closed/cancelled (StatusCode 4)
        UPDATE RestaurantOrderCur SET StatusCode = 4, isOrderClosed = 1 WHERE OrderNumber = @oid;
        -- Mark all details as cancelled (StatusCode 0)
        UPDATE RestaurantOrderDetailCur SET StatusCode = 0 WHERE OrderId IN (SELECT OrderId FROM RestaurantOrderCur WHERE OrderNumber = @oid);
      `);

    await transaction.commit();
    console.log(`✅ [CancelOrder] Order ${orderId} cancelled successfully`);
    
    // Emit socket updates
    const io = req.app.get("io");
    if (io) {
      if (targetTableId) {
        const cleanTid = String(targetTableId).replace(/^\{|\}$/g, "");
        io.emit("table_status_updated", { tableId: cleanTid, status: 0, totalAmount: 0 });
        io.emit("cart_updated", { tableId: cleanTid });
      }
      io.emit("order_status_update", { orderId, status: "CANCELLED" });
    }

    res.json({ success: true, message: "Order Cancelled Successfully" });
  } catch (err) {
    if (transaction) await transaction.rollback();
    console.error("❌ [CancelOrder] ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
