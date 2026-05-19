import React, { useState, useEffect } from "react";
// import axios from "axios";
import "./App.css";
import { BASE_URL } from "./Configs/api";

function App() {

   const API = `${BASE_URL}/api`;
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);

  // Navigation states
 const [categories, setCategories] = useState([]);
const [groups, setGroups] = useState([]);
const [dishes, setDishes] = useState([]);

const [activeCategory, setActiveCategory] = useState(null);
const [activeGroup, setActiveGroup] = useState(null);
const [tableNo, setTableNo] = useState("");
const [tableId, setTableId] = useState("");

const [currentOrderId, setCurrentOrderId] = useState(null);

const [showPaymentPopup, setShowPaymentPopup] = useState(false);



  // Modal states
  const [showModifier, setShowModifier] = useState(false);
  const [selectedDish, setSelectedDish] = useState(null);
  const [modifiers, setModifiers] = useState([]);
  const [selectedModifierIds, setSelectedModifierIds] = useState([]);

  // Custom Mod states
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customItemName, setCustomItemName] = useState("");
  const [customItemPrice, setCustomItemPrice] = useState("");
  const [customMods, setCustomMods] = useState([]);

useEffect(() => {

  loadKitchens();

  const params = new URLSearchParams(window.location.search);

 const table = params.get("table");
const tid = params.get("tableId");

if (table) {
  setTableNo(table);
}

if (tid) {
  setTableId(tid);
  loadCart(tid);
}

}, []);

useEffect(() => {

  if (!tableNo) return;

  saveCartToBackend();

}, [cart]);

const loadKitchens = async () => {
  try {
    const res = await fetch(`${API}/kitchens`);
    const data = await res.json();

    setCategories(data);

    if (data.length > 0) {
      setActiveCategory(data[0].CategoryId);
      loadGroups(data[0].CategoryId);
    }
  } catch (err) {
    console.log(err);
  }
};

const loadGroups = async (categoryId) => {
  try {
    const res = await fetch(`${API}/dishgroups/${categoryId}`);
    const data = await res.json();

    setGroups(data);

    if (data.length > 0) {
      setActiveGroup(data[0].DishGroupId);
      loadDishes(data[0].DishGroupId);
    }
  } catch (err) {
    console.log(err);
  }
};

const loadDishes = async (groupId) => {
  try {
    const res = await fetch(`${API}/dishes/group/${groupId}`);
    const data = await res.json();

    setDishes(data);
  } catch (err) {
    console.log(err);
  }
};

 const filteredItems = dishes.filter((dish) =>
  dish.Name?.toLowerCase().includes(search.toLowerCase())
);

  const openModifiers = (dish) => {
   if (dish.HasModifier) {
      setSelectedDish(dish);
      loadModifiers(dish.DishId);
      setSelectedModifierIds([]);
      setCustomMods([]);
      setShowModifier(true);
    } else {
      addToCartSimple(dish);
    }
  };
  
const loadModifiers = async (dishId) => {
  try {
    const res = await fetch(`${API}/modifiers/${dishId}`);
    const data = await res.json();

    const hasOpen = data.some(
  (m) =>
    m.ModifierName?.toUpperCase() === "OPEN"
   );

if (!hasOpen) {
  data.push({
    ModifierID: "open",
    ModifierName: "OPEN",
    Price: 0,
  });
}

setModifiers(data);
  } catch (err) {
    console.log(err);
  }
};
const addToCartSimple = async (dish) => {

  setCart((prev) => {

    const existing = prev.find(
      (item) =>
        (item.DishId || item.id) === dish.DishId
    );

    // already exists
    if (existing) {
      return prev.map((item) =>
        (item.DishId || item.id) === dish.DishId
          ? {
              ...item,
              qty: (item.qty || 1) + 1,
            }
          : item
      );
    }

    // new item
    return [
      ...prev,
          {
        ...dish,
        cartId: crypto.randomUUID(),

        qty: 1,

        selectedMods: [],

        finalPrice: Number(dish.Price || 0),
      }
    ];
  });

};

const increaseQty = (cartId) => {

  setCart((prev) =>

    prev.map((item) =>

      item.cartId === cartId
        ? {
            ...item,
            qty: (item.qty || 1) + 1,
          }
        : item
    )
  );
};

const decreaseQty = (cartId) => {

  setCart((prev) =>

    prev
      .map((item) =>

        item.cartId === cartId
          ? {
              ...item,
              qty: (item.qty || 1) - 1,
            }
          : item
      )

      .filter((item) => item.qty > 0)
  );
};

const saveCartToBackend = async () => {

  try {

    const payload = {

      tableId: tableId,

      orderId: currentOrderId,

      userId: "00000000-0000-0000-0000-000000000000",

      items: cart.map((item) => ({

        id: item.DishId || item.id,

        name: item.Name || item.name,

        qty: item.qty || 1,

        price: item.Price || item.price || 0,

        modifiers: item.selectedMods || [],

        note: item.note || "",

        status: "NEW",
      })),
    };

    const res = await fetch(`${API}/order/save-cart`, {

      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(payload),
    });

    const data = await res.json();

    console.log("SAVE CART:", data);

    if (data.orderId) {
      setCurrentOrderId(data.orderId);
    }

  } catch (err) {

    console.log("SAVE CART ERROR:", err);
  }
};

const placeOrder = async () => {

  try {

    const payload = {

      tableId: tableId,

      orderId: currentOrderId,

      userId: "00000000-0000-0000-0000-000000000000",

      items: cart.map((item) => ({

        id: item.DishId || item.id,

        name: item.Name || item.name,

        qty: item.qty || 1,

        price: item.Price || item.price || 0,

        modifiers: item.selectedMods || [],

        note: item.note || "",

        status: "SENT",
      })),
    };

    const res = await fetch(`${API}/order/send`, {

      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(payload),
    });

    const data = await res.json();

    console.log("ORDER SEND:", data);

    if (data.success) { 
      if (data.orderId) { setCurrentOrderId(data.orderId); } 
      const totalAmount = 
      cart .reduce( (s, i) => s + ( Number(i.Price || i.price || 0) * Number(i.qty || 1) ), 0 ) .toFixed(2); 
      setShowPaymentPopup(true);
    } 
    else { 
      alert(data.error || "Failed to place order"); 
    }

  } catch (err) {

    console.log("PLACE ORDER ERROR:", err);

    alert("Server Error");
  }
};
const loadCart = async (tableId) => {

  try {

    const res = await fetch(`${API}/order/cart/${tableId}`);

    const data = await res.json();

    console.log("LOAD CART:", data);

    if (data.items) {

      const formatted = data.items.map((item) => ({

        ...item,

        cartId: crypto.randomUUID(),

        selectedMods: item.modifiers || [],
      }));

      setCart(formatted);
    }

    if (data.currentOrderId) {
      setCurrentOrderId(data.currentOrderId);
    }

  } catch (err) {

    console.log("LOAD CART ERROR:", err);
  }
};
  const toggleModifier = (mod) => {
    if (mod.ModifierName.toUpperCase() === "OPEN") {
      setShowCustomModal(true);
      return;
    }

    setSelectedModifierIds((prev) => {
      if (prev.includes(mod.ModifierID)) {
        return prev.filter((id) => id !== mod.ModifierID);
      } else {
        return [...prev, mod.ModifierID];
      }
    });
  };

  const addCustomMod = () => {
    if (!customItemName.trim()) return;
    const newId = `custom-${Date.now()}`;
    const newMod = {
      ModifierID: newId,
      ModifierName: customItemName,
      Price: parseFloat(customItemPrice) || 0,
    };

    setCustomMods((prev) => [...prev, newMod]);
    setSelectedModifierIds((prev) => [...prev, newId]);

    setShowCustomModal(false);
    setCustomItemName("");
    setCustomItemPrice("");
  };

 const addWithModifiers = () => {

  if (!selectedDish) return;

  const allAvailable = [...modifiers, ...customMods];

  const selectedMods = allAvailable.filter((m) =>
    selectedModifierIds.includes(m.ModifierID)
  );

  const extra = selectedMods.reduce(
    (sum, m) => sum + Number(m.Price || 0),
    0
  );

  const finalPrice =
    Number(selectedDish.Price || 0) +
    Number(extra);

  setCart((prev) => {

    // same dish + same modifiers
    const existing = prev.find((item) => {

      const oldMods = JSON.stringify(
        [...(item.selectedMods || [])]
          .map((m) => m.ModifierID)
          .sort()
      );

      const newMods = JSON.stringify(
        [...selectedMods]
          .map((m) => m.ModifierID)
          .sort()
      );

      return (
       item.DishId === selectedDish.DishId &&
      (item.modifierKey || "") ===
      selectedMods
        .map((m) => m.ModifierID)
        .sort()
        .join("-")
      );
    });

    // increase qty
    if (existing) {
      return prev.map((item) =>
        item === existing
          ? {
              ...item,
              qty: (item.qty || 1) + 1,
            }
          : item
      );
    }

    // new cart item
      return [
    ...prev,
    {
      ...selectedDish,

      cartId: crypto.randomUUID(),

      qty: 1,

      selectedMods,

      finalPrice,

      modifierKey: selectedMods
        .map((m) => m.ModifierID)
        .sort()
        .join("-"),
    },
  ];
  });

  setShowModifier(false);
};

  // SVGs for Icons
  const BackIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
  );

  const SearchIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
  );

  const CartIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>
  );

  const ForkKnifeIcon = () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path><path d="M7 2v20"></path><path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path></svg>
  );

  const BurgerDrinkIcon = () => (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
      <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
      <line x1="6" y1="1" x2="6" y2="4"></line>
      <line x1="10" y1="1" x2="10" y2="4"></line>
      <line x1="14" y1="1" x2="14" y2="4"></line>
    </svg>
  );

  const GPayBrand = () => (
    <div style={{display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', fontSize: '12px', color: '#5f6368'}}>
      <span style={{display:'flex'}}>
        <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
      </span>
      Pay
    </div>
  );

  const MastercardBrand = () => (
    <svg width="28" height="18" viewBox="0 0 24 16">
      <circle cx="8" cy="8" r="8" fill="#EB001B"/>
      <circle cx="16" cy="8" r="8" fill="#F79E1B" fillOpacity="0.8"/>
    </svg>
  );

  const UnionPayBrand = () => (
    <div style={{background: '#fff', border: '1px solid #ccc', borderRadius: '4px', padding: '1px 3px', fontSize: '6px', fontWeight: 'bold', display: 'flex', flexDirection: 'column', lineHeight: 1.1, alignItems: 'center', width: '30px'}}>
      <span style={{color: '#d9251c', transform: 'scale(0.9)'}}>UnionPay</span>
      <span style={{color: '#004f9e', transform: 'scale(0.9)'}}>银联</span>
    </div>
  );

  const ApplePayBrand = () => (
    <div style={{display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold', fontSize: '13px', color: '#000'}}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16.36 14.08c-.03-2.92 2.39-4.32 2.5-4.39-1.36-1.99-3.46-2.25-4.21-2.28-1.78-.18-3.48 1.05-4.4 1.05-.92 0-2.31-1.02-3.8-1-1.95.03-3.76 1.13-4.76 2.87-2.03 3.53-.52 8.75 1.45 11.59.96 1.39 2.08 2.94 3.6 2.89 1.46-.06 2.02-.95 3.79-.95 1.76 0 2.27.95 3.82.92 1.57-.03 2.54-1.42 3.49-2.81 1.1-1.61 1.55-3.17 1.57-3.25-.03-.01-2.99-1.15-3.05-4.64zM13.88 5.76c.8-.97 1.34-2.32 1.19-3.66-1.16.05-2.58.78-3.41 1.76-.73.86-1.35 2.24-1.18 3.55 1.3.1 2.6-.66 3.4-1.65z"/></svg>
      Pay
    </div>
  );

  const VisaBrand = () => (
    <div style={{color: '#1434CB', fontWeight: '900', fontStyle: 'italic', fontSize: '15px', letterSpacing: '-1px'}}>VISA</div>
  );

  const AmexBrand = () => (
    <div style={{background: '#2671B9', color: '#fff', fontSize: '6px', fontWeight: 'bold', padding: '2px', borderRadius: '2px', lineHeight: 1.1, width: '28px', textAlign: 'center'}}>
      AMERICAN<br/>EXPRESS
    </div>
  );

  const CashBrand = () => (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <svg width="24" height="20" viewBox="0 0 40 30" fill="none">
        <rect x="2" y="4" width="28" height="16" rx="2" fill="#2ECC71"/>
        <circle cx="16" cy="12" r="3" fill="#27AE60"/>
        <circle cx="26" cy="20" r="6" fill="#F1C40F" stroke="#F39C12" strokeWidth="1"/>
        <circle cx="32" cy="16" r="5" fill="#F1C40F" stroke="#F39C12" strokeWidth="1"/>
      </svg>
    </div>
  );

  const VoucherBrand = () => (
    <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
      <svg width="24" height="16" viewBox="0 0 40 30" fill="none">
        <rect x="4" y="6" width="30" height="16" fill="#FFF1E6" stroke="#FF9F43" strokeWidth="1" strokeDasharray="3 2"/>
        <rect x="14" y="6" width="6" height="16" fill="#FF9F43"/>
        <text x="12" y="16" fontSize="6" fill="#d35400" fontWeight="bold">VOUCHER</text>
      </svg>
    </div>
  );

  const NetsBrand = () => (
    <div style={{color: '#E51937', fontWeight: '900', fontStyle: 'italic', fontSize: '12px', letterSpacing: '-1px'}}>NETS</div>
  );

  const PayNowBrand = () => (
    <div style={{color: '#7B1FA2', fontWeight: '900', fontSize: '10px', display: 'flex', flexDirection: 'column', lineHeight: 0.9, alignItems: 'center'}}>
      <span>PAY</span>
      <span>N<span style={{color: '#E51937'}}>O</span>W</span>
    </div>
  );

   const totalAmount 
   = cart .reduce( (s, i) => s + 
          ( Number(i.Price || i.price || 0) * 
          Number(i.qty || 1) ), 0 ) .toFixed(2);

  return (
    <div className="pos-app">
      {/* Top Header */}
      <div className="pos-header">
        {/* <button className="icon-btn"><BackIcon /></button> */}
        <div className="search-wrap">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {/* <button className="icon-btn cart-btn-header">
          <CartIcon />
          {cart.length > 0 && <span className="badge">{cart.length}</span>}
        </button> */}
      </div>

      {/* Categories Navigation */}
      <div className="nav-scroll">
            {categories.map((cat) => (
        <button
          key={cat.CategoryId}
          className={`pill cat-pill ${
            activeCategory === cat.CategoryId ? "active" : ""
          }`}
          onClick={() => {
            setActiveCategory(cat.CategoryId);
            loadGroups(cat.CategoryId);
          }}
        >
          {cat.KitchenTypeName}
        </button>
      ))}
      </div>

      {/* Groups Navigation */}
      <div className="nav-scroll groups-row">
              {groups.map((grp) => (
        <button
          key={grp.DishGroupId}
          className={`pill grp-pill ${
            activeGroup === grp.DishGroupId ? "active" : ""
          }`}
          onClick={() => {
            setActiveGroup(grp.DishGroupId);
            loadDishes(grp.DishGroupId);
          }}
        >
          {grp.DishGroupName}
        </button>
      ))}
      </div>

      {/* Main Content Area */}
      <div className="pos-content">
        {/* Left Side: Dish List */}
        <div className="dish-list">
          {filteredItems.map((dish) => (
            <div className="dish-card" key={dish.DishId} onClick={() => openModifiers(dish)}>
              <div className="dish-img-box">
               {dish.HasImage ? (
                    <img
                      src={`${API}/image/${dish.Image}`}
                      alt={dish.Name}
                    />
                  ) : (
                  <div className="dish-placeholder">
                    <ForkKnifeIcon />
                  </div>
                )}
              </div>
              <div className="dish-name">{dish.Name}</div>
              <div className="dish-price">${dish.Price.toFixed(2)}</div>
            </div>
          ))}
        </div>

        {/* Right Side: Cart Sidebar */}
        <div className="cart-sidebar">
          <div className="cart-header">
            <span className="cart-table-no">
                Table No:{tableNo || "1"}
              </span>
            <span className="cart-sync">• Syncing</span>
          </div>

          {cart.length === 0 ? (
            <div className="empty-cart-state">
              <div className="empty-icon-wrap">
                <BurgerDrinkIcon />
              </div>
              <h3>Empty Cart</h3>
              <p>Select delicious dishes from the menu to start this order.</p>
            </div>
          ) : (
            <div className="cart-items-container">
              <div className="cart-items-list">
               {cart.map((item, index) => (
  <div key={index} className="cart-item">

    <div className="ci-info">

      <div className="ci-name">
        {item.Name || item.name}
        {item.selectedMods?.length > 0 && (
        <div className="ci-mods">
          {item.selectedMods
            .map((m) => m.ModifierName)
            .join(", ")}
        </div>
      )}
      </div>

      <div className="qty-controls">

        <button
          className="qty-btn"
          onClick={() =>
           decreaseQty(item.cartId)
          }
        >
          -
        </button>

        <span className="qty-text">
          {item.qty || 1}
        </span>

        <button
          className="qty-btn"
          onClick={() =>
            increaseQty(item.cartId)
          }
        >
          +
        </button>

      </div>

    </div>

    <div className="ci-price">
      $
      {(
        Number(item.Price || item.price || 0) *
        Number(item.qty || 1)
      ).toFixed(2)}
    </div>

  </div>
))}
              </div>
              <div className="cart-footer">
                <div className="cart-total-row">
                  <span>Total</span>
                  <span>${cart
                    .reduce(
                      (s, i) =>
                        s +
                        (
                          Number(i.Price || i.price || 0) *
                          Number(i.qty || 1)
                        ),
                      0
                    )
                    .toFixed(2)}</span>
                </div>
               <button 
            className="checkout-btn"
            onClick={placeOrder}
          >
            Order Placed
          </button>
         </div>
            </div>
          )}
        </div>
      </div>

      {/* MODIFIER MODAL */}
      {showModifier && selectedDish && (
        <div className="modal-overlay" onClick={() => setShowModifier(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Modifiers for {selectedDish.Name || selectedDish.name}</h2>
              <button className="modal-close" onClick={() => setShowModifier(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div className="modifier-list">
                {modifiers.map((m) => (
                  <div
                    key={m.ModifierID}
                    className="modifier-row"
                    onClick={() => toggleModifier(m)}
                  >
                    <span className="modifier-name">
                      {m.ModifierName} {m.Price > 0 && `(+$${m.Price.toFixed(2)})`}
                    </span>
                    <div
                      className={`checkbox ${selectedModifierIds.includes(m.ModifierID) ? "active" : ""
                        }`}
                    >
                      {selectedModifierIds.includes(m.ModifierID) && (
                        <span className="checkmark">&#10003;</span>
                      )}
                    </div>
                  </div>
                ))}

                {/* Display added custom mods */}
                {customMods.map((m) => (
                  <div
                    key={m.ModifierID}
                    className="modifier-row"
                    onClick={() => toggleModifier(m)}
                  >
                    <span className="modifier-name" style={{ color: '#f97316' }}>
                      {m.ModifierName} {m.Price > 0 && `(+$${m.Price.toFixed(2)})`} (Custom)
                    </span>
                    <div
                      className={`checkbox ${selectedModifierIds.includes(m.ModifierID) ? "active" : ""
                        }`}
                    >
                      {selectedModifierIds.includes(m.ModifierID) && (
                        <span className="checkmark">&#10003;</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowModifier(false)}>
                Cancel
              </button>
              <button className="btn-add" onClick={addWithModifiers}>
                Done
              </button>
            </div>
          </div>

          {/* CUSTOM ITEM SUB-MODAL */}
          {showCustomModal && (
            <div className="modal-overlay sub-modal-overlay">
              <div className="custom-item-modal" onClick={(e) => e.stopPropagation()}>
                <h3 className="custom-modal-title">Add Custom Item</h3>

                <div className="input-group">
                  <label className="input-label">Item Name *</label>
                  <input
                    type="text"
                    className="custom-input"
                    placeholder="Enter item name"
                    value={customItemName}
                    onChange={(e) => setCustomItemName(e.target.value)}
                    autoFocus
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Price (Optional)</label>
                  <input
                    type="number"
                    className="custom-input"
                    placeholder="Enter price"
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                  />
                </div>

                <div className="custom-modal-actions">
                  <button
                    className="btn-cancel"
                    onClick={() => setShowCustomModal(false)}
                  >
                    Cancel
                  </button>
                  <button className="btn-add" onClick={addCustomMod}>
                    Add Item
                  </button>
                </div>
              </div>
            </div>
        )}
        </div>
        
      )}
    {showPaymentPopup && (
  <div className="modal-overlay">

    <div className="payment-popup">

      <button
        className="payment-close"
        onClick={() => setShowPaymentPopup(false)}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>

      <div className="payment-dot"></div>

      <div className="payment-icon-outer">
        <div className="payment-icon-inner">?</div>
      </div>

      <h2 className="payment-title">
        How would you like to pay ?
      </h2>

      <p className="payment-subtitle">
        These are the available payment methods
      </p>

      <div className="payment-card">

        <div className="card-top-section card-1-top">
          <div className="qlub-branding">
            <span className="pb-text">Powered By</span>
            <span className="qlub-logo">qlub <span className="qlub-dots">::</span></span>
          </div>
          <div className="brand-grid">
            <GPayBrand />
            <MastercardBrand />
            <UnionPayBrand />
            <ApplePayBrand />
            <VisaBrand />
            <AmexBrand />
          </div>
        </div>

        <button
          className="payment-btn"
          onClick={() => {
            alert("Online Payment");
          }}
        >
          Pay Online
        </button>

      </div>

      <div className="payment-or">
        OR
      </div>

      <div className="payment-card">

        <div className="card-top-section card-2-top">
          <div className="brand-grid full-grid">
            <CashBrand />
            <VoucherBrand />
            <MastercardBrand />
            <NetsBrand />
            <PayNowBrand />
            <VisaBrand />
          </div>
        </div>

        <button
          className="payment-btn"
          onClick={() => {
            alert("Pay At Cashier");
          }}
        >
          Pay At Cashier Now
        </button>

      </div>

    </div>

  </div>
)}
     </div>
   
  );
}

export default App;