import React, { useState, useEffect, useRef } from "react";
// import axios from "axios";
import "./App.css";
import { BASE_URL } from "./Configs/api";
import { QRCodeSVG } from "qrcode.react";
import {
  Routes,
  Route
} from "react-router-dom";

import SettlementSuccess from "./SettlementSuccess";

function App() {

  const skipSaveRef = useRef(false);
  const deleteInProgressRef = useRef(false);
  const actionRef = useRef(""); // "INSERT", "UPDATE", "DELETE"

  const API = `${BASE_URL}/api`;
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [isCartLoading, setIsCartLoading] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

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
  const [showOnlinePayment, setShowOnlinePayment] = useState(false);
  const [showPayNowModal, setShowPayNowModal] = useState(false);
  const [showUpiModal, setShowUpiModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [paynowUpiId, setPaynowUpiId] = useState('');
  const [upiUpiId, setUpiUpiId] = useState('');
  const [tempPaynowUpiId, setTempPaynowUpiId] = useState('');
  const [tempUpiUpiId, setTempUpiUpiId] = useState('');

  const handlePaymentSuccess = (msg) => {
    setCart((prev) => prev.map((item) => ({ ...item, status: "SENT" })));
    setShowPaymentPopup(false);
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(""), 3000);
  };


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

    const fetchQRs = async () => {
      try {
        const res = await fetch(`${API}/paymodes/qrs`);
        const data = await res.json();
        if (data.paynow) {
          setPaynowUpiId(data.paynow);
          setTempPaynowUpiId(data.paynow);
        }
        if (data.upi) { setUpiUpiId(data.upi); setTempUpiUpiId(data.upi); }
      } catch (err) {
        console.log("FETCH QRS ERROR:", err);
      }
    };
    fetchQRs();

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

    if (skipSaveRef.current) {
      skipSaveRef.current = false;
      return;
    }

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
    actionRef.current = "INSERT";
    setCart((prev) => {

      // const existing = prev.find(
      //   (item) =>
      //     (item.DishId || item.id) === dish.DishId
      // );

    const existing = prev.find(
  (item) =>
    (item.DishId || item.id) === dish.DishId &&
    item.status !== "SENT"
);
      // already exists
      if (existing) {
        return prev.map((item) =>
          (item.DishId || item.id) === dish.DishId
            ? {
              ...item,
              qty: (item.qty || 1) + 1,
              status: "NEW",
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
          status: "NEW",
        }
      ];
    });

  };

  const increaseQty = (index) => {
    actionRef.current = "UPDATE";
    setCart((prev) =>

      prev.map((item, i) =>

        i === index
          ? {
            ...item,
            qty: (item.qty || 1) + 1,
          }
          : item
      )
    );
  };

  const decreaseQty = async (index) => {
    const item = cart[index];
    if (!item) return;

    let currentQty = Number(item.qty);
    if (isNaN(currentQty)) currentQty = 1;

    // qty = 1 → delete from DB
    if (currentQty <= 1) {

      // ✅ Set skipSaveRef BEFORE setCart so the useEffect does NOT fire
      // saveCartToBackend automatically — preventing a race with the delete API
      skipSaveRef.current = true;
      deleteInProgressRef.current = true;
      actionRef.current = "DELETE";

      // Optimistic UI update: reliably remove by exact index
      setCart((prev) => {
        const newCart = [...prev];
        newCart.splice(index, 1);
        return newCart;
      });

      try {
        let actualLineItemId = item.lineItemId || item.OrderDetailId;

        // If no DB ID in state, fetch once from DB to find it
        if (!actualLineItemId && tableId) {
          try {
            const cartRes = await fetch(`${API}/order/cart/${tableId}`);
            const cartData = await cartRes.json();
            const match = cartData?.items?.find(b =>
              String(b.id || b.DishId || b.dishId) === String(item.DishId || item.id)
            );
            if (match) {
              actualLineItemId = match.lineItemId || match.OrderDetailId;
            }
          } catch (e) {
            console.log("Fetch lineItemId error:", e);
          }
        }

        if (actualLineItemId) {
          await fetch(`${API}/order/delete-cart-item`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tableId: tableId,
              lineItemId: actualLineItemId,
            }),
          });
          console.log("DELETE ITEM: sent delete for", actualLineItemId);
        } else {
          console.warn("DELETE ITEM: no lineItemId found, skipping DB delete");
        }

      } catch (err) {
        console.log("DELETE ITEM ERROR:", err);
      } finally {
        deleteInProgressRef.current = false;
        // Reload cart from DB to confirm final state
        if (tableId) {
          await loadCart(tableId);
        }
      }

      return;
    }

    // decrease qty
    actionRef.current = "UPDATE";
    setCart((prev) => {
      const newCart = [...prev];
      newCart[index] = { ...newCart[index], qty: currentQty - 1 };
      return newCart;
    });

  };

 // Online payment flow using YeahPay demo

  const handlePayOnline = async () => {
    // Calculate total amount inside the function
    const totalAmount = cart.reduce((s, i) => 
        s + (Number(i.Price || i.price || 0) * Number(i.qty || 1)), 0
    ).toFixed(2);
    
    console.log("Opening payment for amount:", totalAmount);
    console.log("POS Order ID:", currentOrderId);
    
    // Pass the real POS orderId as posOrderId so we can use it on success
    // (YeahPay generates its own orderId which does NOT match our DB OrderNumber)
    const demoUrl = `https://yeahpay-demo-production.up.railway.app?amount=${totalAmount}&orderId=${currentOrderId}&posOrderId=${encodeURIComponent(currentOrderId)}&from=pos`;
    
    const paymentWindow = window.open(demoUrl, '_blank', 'width=500,height=700');
    
    if (!paymentWindow) {
        alert("Popup blocked! Please allow popups for this site.");
        return;
    }
    
    // Capture the POS orderId at time of opening (closure)
    const posOrderIdAtOpen = currentOrderId;

    // Listen for payment success message
    const handleMessage = (event) => {
        if (event.data.type === 'YEAHPAY_PAYMENT_SUCCESS') {
            console.log("Payment success message received:", event.data);
            
            // Remove event listener
            window.removeEventListener('message', handleMessage);
            
            // Use the real POS orderId (posOrderId from event, or fallback to captured one)
            // The YeahPay demo may send back posOrderId if it forwards it; otherwise use our captured value
            const realPosOrderId = event.data.posOrderId || posOrderIdAtOpen;
            console.log("Using POS OrderId for DB update:", realPosOrderId);

            // Complete the order using the real POS orderId
            completeOrder(realPosOrderId, totalAmount);
            
            // Close the payment window
            if (paymentWindow) paymentWindow.close();
        }
    };
    
    window.addEventListener('message', handleMessage);
};

// const completeOrder = async (orderId, amount) => {
//     try {
//         const res = await fetch(`${API}/sales/save`, {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({
//                 orderId: orderId,
//                 tableNo: tableNo,
//                 tableId: tableId,
//                 subTotal: parseFloat(amount),
//                 totalAmount: parseFloat(amount),
//                 paymentMethod: "ONLINE",
//                 items: cart.map((item) => ({
//                     id: item.DishId || item.id,
//                     name: item.Name || item.name,
//                     qty: Number(item.qty || 1),
//                     price: Number(item.Price || item.price || 0)
//                 }))
//             })
//         });
        
//         const data = await res.json();
//         if (data.success) {
//             // Clear cart
//             setCart([]);
//             // Show success message
//             handlePaymentSuccess(`Payment Successful! Amount: S$${amount}`);
//             // Redirect to settlement success
//             setTimeout(() => {
//                 window.location.href = `/settlement-success?tableId=${tableId}&table=${tableNo}&orderId=${orderId}`;
//             }, 1500);
//         } else {
//             alert(data.error || "Payment Failed");
//         }
//     } catch (err) {
//         console.log("COMPLETE ORDER ERROR:", err);
//         alert("Server Error: " + err.message);
//     }
// };

const completeOrder = async (posOrderId, amount) => {
  try {

    console.log("[completeOrder] Using POS orderId:", posOrderId, "Amount:", amount);

    // 1. UPDATE RestaurantOrderDetailCur StatusCode = 2 (SENT) for all items in this order
    const markSentRes = await fetch(`${API}/order/mark-sent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderId: posOrderId
      })
    });
    const markSentData = await markSentRes.json();
    console.log("[mark-sent] RestaurantOrderDetailCur StatusCode=2 update:", markSentData);

    // 2. SAVE SALES
    const res = await fetch(`${API}/sales/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        orderId: posOrderId,
        tableNo: tableNo,
        tableId: tableId,
        subTotal: parseFloat(amount),
        totalAmount: parseFloat(amount),
        paymentMethod: "ONLINE",
        items: cart.map((item) => ({
          id: item.DishId || item.id,
          name: item.Name || item.name,
          qty: Number(item.qty || 1),
          price: Number(item.Price || item.price || 0)
        }))
      })
    });

    const data = await res.json();
    console.log("SALES SAVE:", data);

    if (!data.success) {
      alert(data.error || "Settlement Failed");
      return;
    }

    // 3. UPDATE TableMaster PAYMENT_STATUS = 1 (paid online)
    await fetch(`${API}/order/payment-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tableId: tableId,
        paymentStatus: 1
      })
    });

    // 4. SUCCESS MESSAGE
    setPaymentDone(true);
    handlePaymentSuccess(`Payment Successful! Amount: S$${amount}`);

    // 5. OPEN SETTLEMENT PAGE
    setTimeout(() => {
      window.location.href =
        `/settlement-success?tableId=${tableId}&table=${tableNo}&orderId=${posOrderId}`;
    }, 1000);

  } catch (err) {

    console.log("COMPLETE ORDER ERROR:", err);
    alert("Server Error: " + err.message);
  }
};

  const saveCartToBackend = async () => {
    setIsCartLoading(true);
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

          modifiers: (item.selectedMods || []).filter(
            (m) =>
              /^[0-9a-fA-F-]{36}$/.test(m.ModifierID)
          ),

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

      if (tableId && !deleteInProgressRef.current) {
        if (actionRef.current === "UPDATE") {
          // User requested refresh the GET option for plus and minus buttons
          try {
            // Wait briefly for DB transaction to commit
            await new Promise(r => setTimeout(r, 600));
            await loadCart(tableId);
          } catch (syncErr) {
            console.log("Refresh GET error:", syncErr);
          }
        } else if (actionRef.current === "INSERT") {
          // Silently sync real OrderDetailIds for new items without overwriting optimistic quantities
          try {
            const cartRes = await fetch(`${API}/order/cart/${tableId}`);
            const cartData = await cartRes.json();
            
            if (cartData && cartData.items) {
              setCart(prev => {
                let changed = false;
                const updatedCart = prev.map(item => {
                  if (!item.OrderDetailId && !item.lineItemId) {
                    const match = cartData.items.find(b => 
                      (b.id || b.DishId || b.dishId) == (item.DishId || item.id)
                    );
                    if (match && (match.OrderDetailId || match.lineItemId)) {
                      changed = true;
                      return { 
                        ...item, 
                        OrderDetailId: match.OrderDetailId || match.lineItemId, 
                        lineItemId: match.OrderDetailId || match.lineItemId 
                      };
                    }
                  }
                  return item;
                });
                
                if (changed) {
                  skipSaveRef.current = true;
                  return updatedCart;
                }
                return prev;
              });
            }
          } catch (syncErr) {
            console.log("Silent ID sync error:", syncErr);
          }
        }
      }

    } catch (err) {

      console.log("SAVE CART ERROR:", err);
    } finally {
      setIsCartLoading(false);
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

          modifiers: (item.selectedMods || [])
            .filter((m) =>
              /^[0-9a-fA-F-]{36}$/.test(m.ModifierID)
            )
            .map((m) => ({
              ModifierId: m.ModifierID,
              ModifierName: m.ModifierName,
              Price: m.Price || 0,
              qty: 1,
            })),

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
          cart.reduce((s, i) => s + (Number(i.Price || i.price || 0) * Number(i.qty || 1)), 0).toFixed(2);
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

      console.log("LOAD CART ITEMS:", JSON.stringify(data.items, null, 2));

      if (data.items) {

        const formatted = data.items.map((item) => ({

          ...item,

          lineItemId:
            item.OrderDetailId ||
            item.lineItemId,

          cartId:
            item.OrderDetailId ||
            crypto.randomUUID(),

          selectedMods:
            item.modifiers || [],
        }));

        skipSaveRef.current = true;
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
              status: "NEW",
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
          
          status: "NEW",
        },
      ];
    });

    setShowModifier(false);
  };

  const saveUpiId = async (type, upiId) => {
    if (type === 'paynow') {
      setPaynowUpiId(upiId);
    } else if (type === 'upi') {
      setUpiUpiId(upiId);
    }
    try {
      await fetch(`${API}/paymodes/update-qr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payMode: type, upiId: upiId })
      });
    } catch (err) {
      console.log("SAVE UPI ID ERROR:", err);
    }
  };

  // SVGs for Icons
  const SettingsIcon = () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"></circle>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
    </svg>
  );

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
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 'bold', fontSize: '12px', color: '#5f6368' }}>
      <span style={{ display: 'flex' }}>
        <svg width="14" height="14" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" /><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" /><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" /><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" /></svg>
      </span>
      Pay
    </div>
  );

  const MastercardBrand = () => (
    <svg width="28" height="18" viewBox="0 0 24 16">
      <circle cx="8" cy="8" r="8" fill="#EB001B" />
      <circle cx="16" cy="8" r="8" fill="#F79E1B" fillOpacity="0.8" />
    </svg>
  );

  const UnionPayBrand = () => (
    <div style={{ background: '#fff', border: '1px solid #ccc', borderRadius: '4px', padding: '1px 3px', fontSize: '6px', fontWeight: 'bold', display: 'flex', flexDirection: 'column', lineHeight: 1.1, alignItems: 'center', width: '30px' }}>
      <span style={{ color: '#d9251c', transform: 'scale(0.9)' }}>UnionPay</span>
      <span style={{ color: '#004f9e', transform: 'scale(0.9)' }}>银联</span>
    </div>
  );

  const ApplePayBrand = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontWeight: 'bold', fontSize: '13px', color: '#000' }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M16.36 14.08c-.03-2.92 2.39-4.32 2.5-4.39-1.36-1.99-3.46-2.25-4.21-2.28-1.78-.18-3.48 1.05-4.4 1.05-.92 0-2.31-1.02-3.8-1-1.95.03-3.76 1.13-4.76 2.87-2.03 3.53-.52 8.75 1.45 11.59.96 1.39 2.08 2.94 3.6 2.89 1.46-.06 2.02-.95 3.79-.95 1.76 0 2.27.95 3.82.92 1.57-.03 2.54-1.42 3.49-2.81 1.1-1.61 1.55-3.17 1.57-3.25-.03-.01-2.99-1.15-3.05-4.64zM13.88 5.76c.8-.97 1.34-2.32 1.19-3.66-1.16.05-2.58.78-3.41 1.76-.73.86-1.35 2.24-1.18 3.55 1.3.1 2.6-.66 3.4-1.65z" /></svg>
      Pay
    </div>
  );

  const VisaBrand = () => (
    <div style={{ color: '#1434CB', fontWeight: '900', fontStyle: 'italic', fontSize: '15px', letterSpacing: '-1px' }}>VISA</div>
  );

  const AmexBrand = () => (
    <div style={{ background: '#2671B9', color: '#fff', fontSize: '6px', fontWeight: 'bold', padding: '2px', borderRadius: '2px', lineHeight: 1.1, width: '28px', textAlign: 'center' }}>
      AMERICAN<br />EXPRESS
    </div>
  );

  const CashBrand = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="24" height="20" viewBox="0 0 40 30" fill="none">
        <rect x="2" y="4" width="28" height="16" rx="2" fill="#2ECC71" />
        <circle cx="16" cy="12" r="3" fill="#27AE60" />
        <circle cx="26" cy="20" r="6" fill="#F1C40F" stroke="#F39C12" strokeWidth="1" />
        <circle cx="32" cy="16" r="5" fill="#F1C40F" stroke="#F39C12" strokeWidth="1" />
      </svg>
    </div>
  );

  const VoucherBrand = () => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width="24" height="16" viewBox="0 0 40 30" fill="none">
        <rect x="4" y="6" width="30" height="16" fill="#FFF1E6" stroke="#FF9F43" strokeWidth="1" strokeDasharray="3 2" />
        <rect x="14" y="6" width="6" height="16" fill="#FF9F43" />
        <text x="12" y="16" fontSize="6" fill="#d35400" fontWeight="bold">VOUCHER</text>
      </svg>
    </div>
  );

  const NetsBrand = () => (
    <div style={{ color: '#E51937', fontWeight: '900', fontStyle: 'italic', fontSize: '12px', letterSpacing: '-1px' }}>NETS</div>
  );

  const PayNowBrand = () => (
    <div style={{ color: '#7B1FA2', fontWeight: '900', fontSize: '10px', display: 'flex', flexDirection: 'column', lineHeight: 0.9, alignItems: 'center' }}>
      <span>PAY</span>
      <span>N<span style={{ color: '#E51937' }}>O</span>W</span>
    </div>
  );

  const totalAmount
    = cart.reduce((s, i) => s +
      (Number(i.Price || i.price || 0) *
        Number(i.qty || 1)), 0).toFixed(2);

 return (

  <Routes>

    <Route
      path="/"
      element={

        // <div className="pos-app">
    <div className="pos-app">
      {/* Top Header */}
      <div className="pos-header">
        {/* <button className="icon-btn" onClick={() => setShowSettingsModal(true)}>
          <SettingsIcon />
        </button> */}
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
            className={`pill cat-pill ${activeCategory === cat.CategoryId ? "active" : ""
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
            className={`pill grp-pill ${activeGroup === grp.DishGroupId ? "active" : ""
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
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button 
                onClick={() => tableId && loadCart(tableId)}
                style={{ background: 'none', border: '1px solid #ddd', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                title="Refresh Cart"
                disabled={isCartLoading}
              >
                ↻ Refresh
              </button>
              <span className="cart-sync" style={{ color: isCartLoading ? '#f97316' : '#9ca3af' }}>
                {isCartLoading ? "• Loading..." : "• Synced"}
              </span>
            </div>
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
                          onClick={() => decreaseQty(index)}
                        // disabled={
                        //   (item.status && item.status === "SENT") ||
                        //   isCartLoading
                        // }
                          // style={{ opacity: ((item.status && item.status !== "NEW") || isCartLoading) ? 0.5 : 1 }}
                          style={{
                            opacity: 1
                          }}
                        >
                          -
                        </button>

                        <span className="qty-text">
                          {item.qty || 1}
                        </span>

                        <button
                          className="qty-btn"
                          onClick={() => increaseQty(index)}
                      //  disabled={
                      //   (item.status && item.status === "SENT") ||
                      //   isCartLoading
                      // }
                          // style={{ opacity: ((item.status && item.status !== "NEW") || isCartLoading) ? 0.5 : 1 }}
                          style={{
                      opacity: 1
                    }}
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
                  Place Order
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
                {/* <div className="qlub-branding">
                  <span className="pb-text">Powered By</span>
                  <span className="qlub-logo">qlub <span className="qlub-dots">::</span></span>
                </div> */}
                <div className="brand-grid">
                   <VoucherBrand />
                  <MastercardBrand />
                  <NetsBrand />
                  <PayNowBrand />
                  <VisaBrand />
                  {/* <GPayBrand />
                  <MastercardBrand />
                  <UnionPayBrand />
                  <ApplePayBrand />
                  <VisaBrand />
                  <AmexBrand /> */}
                </div>
              </div>

              {/* <button
                className="payment-btn"
                onClick={() => {
                  setShowPaymentPopup(false);
                  setShowOnlinePayment(true);
                }}
              >
                Pay Online
              </button>*/}

            <button
                  className="payment-btn"
                  onClick={async () => {
                    setShowPaymentPopup(false);
                    try {
                      await fetch(`${API}/order/mark-sent`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ orderId: currentOrderId })
                      });
                      
                      await fetch(`${API}/order/payment-status`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json"
                        },
                        body: JSON.stringify({
                          tableId: tableId,
                          paymentStatus: 1
                        })
                      });

                      skipSaveRef.current = true;
                      setCart((prev) => prev.map((item) => ({ ...item, status: "SENT" })));
                    } catch (e) {
                      console.error("Mark sent/payment status error:", e);
                    }
                    handlePayOnline();
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
  onClick={async () => {
     try {
      await fetch(`${API}/order/mark-sent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: currentOrderId })
      });

      await fetch(`${API}/order/payment-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tableId: tableId,
          paymentStatus: 0
        })
      });

    } catch (e) {

      console.error(e);

    }
    setShowPaymentPopup(false);

    window.location.href =
      `/settlement-success?tableId=${tableId}&table=${tableNo}&orderId=${currentOrderId}`;

  }}
>
  Pay At Cashier Now
</button>

            </div>

          </div>

        </div>
      )}

      {successMessage && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="success-modal">
            <div className="success-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            </div>
            <h2 className="success-title">Success!</h2>
            <p className="success-text">{successMessage}</p>
          </div>
        </div>
      )}

      {showOnlinePayment && (
        <div className="modal-overlay" style={{ zIndex: 10001, padding: 0 }}>
          <div className="pos-app" style={{ width: '100vw', height: '100dvh', background: '#fdfbf7', display: 'flex', flexDirection: 'column', borderRadius: 0 }}>

            <div className="pos-header" style={{ borderBottom: '1px solid #eee', background: 'white' }}>
              <button className="icon-btn" onClick={() => setShowOnlinePayment(false)}>
                <BackIcon />
              </button>
              <div style={{ flex: 1, textAlign: 'center', fontSize: '18px', fontWeight: 'bold' }}>
                Checkout
              </div>
              <div style={{ width: '48px' }}></div>
            </div>

            <div style={{ flex: 1, display: 'flex', gap: '20px', padding: '20px', overflowY: 'auto', flexWrap: 'wrap', alignContent: 'flex-start' }}>
              {/* Left Side: Payment Method */}
              <div style={{ flex: '1 1 300px', background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h3 style={{ margin: '0', textTransform: 'uppercase', fontSize: '12px', color: '#666', letterSpacing: '0.5px' }}>Select Payment Method</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                  {/* <div style={{ padding: '20px 10px', border: '2px solid #f97316', borderRadius: '12px', textAlign: 'center', background: '#fff5eb', color: '#f97316', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                <MastercardBrand /> <span style={{ fontSize: '12px' }}>Credit Card</span>
              </div> */}
                  <div
                    style={{ padding: '20px 10px', border: '1px solid #eee', borderRadius: '12px', textAlign: 'center', color: '#666', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                    onClick={() => setShowPayNowModal(true)}
                  >
                    <PayNowBrand /> <span style={{ fontSize: '12px' }}>PayNow</span>
                  </div>
                  {/* <div
                    style={{ padding: '20px 10px', border: '1px solid #eee', borderRadius: '12px', textAlign: 'center', color: '#666', fontWeight: 'bold', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
                    onClick={() => setShowUpiModal(true)}
                  >
                    <GPayBrand /> <span style={{ fontSize: '12px' }}>GPay / UPI</span>
                  </div> */}
                </div>

                <div style={{ flex: 1 }}></div>

               {/* <button
                  className="checkout-btn"
                  style={{ height: '56px', fontSize: '18px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px' }}
                  // onClick={() => {
                  //   setShowOnlinePayment(false);
                  //   handlePaymentSuccess("Online Payment Successful!");
                  // }}
                  onClick={async () => {

                    try {
                      console.log("CURRENT ORDER ID:", currentOrderId);
                      const res = await fetch(`${API}/sales/save`, {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                        },
                        body: JSON.stringify({

                          orderId:
                            currentOrderId &&
                              currentOrderId !== "null"
                              ? currentOrderId
                              : "00000000-0000-0000-0000-000000000000",

                          tableNo: tableNo,

                          tableId: tableId,

                          subTotal: Number(totalAmount),


                          totalAmount: Number(totalAmount),

                          paymentMethod: "PAYNOW",

                          items: cart.map((item) => ({

                            id: item.DishId || item.id,

                            name: item.Name || item.name,

                            qty: Number(item.qty || 1),

                            price: Number(item.Price || item.price || 0),

                          })),

                        }),
                      });

                      const data = await res.json();

                      console.log("PAYMENT PROCESS:", data);

                      if (data.success) {

                    setShowOnlinePayment(false);

                    handlePaymentSuccess(
                      `Payment Successful! TXN: ${data.transactionId}`
                    );

                    // ✅ Open SettlementSuccess Screen
                    setTimeout(() => {

                      window.location.href =
                        `/settlement-success?tableId=${tableId}&table=${tableNo}&orderId=${currentOrderId}`;

                    }, 1000);

                  } else {

                    alert(data.error || "Payment Failed");

                  }

                    } catch (err) {

                      console.log("PAYMENT ERROR:", err);

                      alert("Server Error");

                    }

                  }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  Complete Settlement
                </button>*/}
         <button
            className="checkout-btn"
            style={{ height: '56px', fontSize: '18px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '20px' }}
            onClick={handlePayOnline}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            Complete Settlement
          </button>
              </div>

              {/* Right Side: Summary */}
              <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <div style={{ background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px', alignItems: 'center' }}>
                    <span style={{ color: '#666', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.5px' }}>Amount Due</span>
                    <span style={{ fontSize: '28px', fontWeight: '900', color: '#f97316' }}>${totalAmount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                    <span style={{ color: '#666', fontWeight: '600' }}>Subtotal</span>
                    <span style={{ fontWeight: 'bold', color: '#1f2937' }}>${totalAmount}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                    <span style={{ color: '#666', fontWeight: '600' }}>GST</span>
                    <span style={{ fontWeight: 'bold', color: '#1f2937' }}>$0.00</span>
                  </div>
                </div>

                <div style={{ flex: 1, background: 'white', borderRadius: '20px', padding: '20px', boxShadow: '0 4px 15px rgba(0,0,0,0.04)', overflowY: 'auto' }}>
                  <h3 style={{ margin: '0 0 15px 0', textTransform: 'uppercase', fontSize: '11px', color: '#666', letterSpacing: '0.5px' }}>Order Items</h3>
                  {cart.map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <div style={{ width: '30px', color: '#f97316', fontWeight: '900', fontSize: '13px' }}>{item.qty}x</div>
                      <div style={{ flex: 1, fontWeight: '600', color: '#1f2937', fontSize: '13px' }}>
                        {item.Name || item.name}
                        {item.selectedMods?.length > 0 && (
                          <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                            {item.selectedMods.map((m) => m.ModifierName).join(", ")}
                          </div>
                        )}
                      </div>
                      <div style={{ fontWeight: 'bold', color: '#1f2937', fontSize: '13px' }}>
                        ${(Number(item.Price || item.price || 0) * Number(item.qty || 1)).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPayNowModal && (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#1f2937' }}>PayNow QR Payment</div>
                  {/* <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>AL-HAZIMA RESTAURANT PTE LTD</div> */}
                </div>
                <button
                  style={{ border: 'none', background: '#F1F5F9', borderRadius: '10px', padding: '6px', cursor: 'pointer', display: 'flex' }}
                  onClick={() => setShowPayNowModal(false)}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              {/* Amount Box */}
              <div style={{ backgroundColor: '#F0F9FF', padding: '10px', borderRadius: '12px', alignItems: 'center', marginBottom: '16px', border: '1px solid #BAE6FD', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '11px', color: '#0369A1', fontWeight: '600', marginBottom: '2px' }}>Please Transfer Exactly</div>
                <div style={{ fontSize: '22px', fontWeight: '900', color: '#0284C7' }}>${totalAmount}</div>
              </div>

              {/* Dynamic QR */}
              <div style={{ alignItems: 'center', marginBottom: '16px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: '150px', height: '150px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.05)', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', border: '1px solid #f0f0f0', display: 'flex' }}>
                  <img
                    src={
                      paynowUpiId?.startsWith("data:")
                        ? paynowUpiId
                        : paynowUpiId?.startsWith("/9j/")
                          ? `data:image/jpeg;base64,${paynowUpiId}`
                          : `data:image/png;base64,${paynowUpiId}`
                    }
                    alt="PayNow QR"
                    style={{
                      width: "130px",
                      height: "130px",
                      objectFit: "contain"
                    }}
                  />
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', fontWeight: '500', textAlign: 'center' }}>
                  Scan this QR and pay {totalAmount} exactly
                </div>
                <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>
                  Scan using PayNow / UPI App
                </div>
              </div>

              {/* Action Buttons */}
              <button
                style={{ width: '100%', display: 'flex', backgroundColor: '#22c55e', padding: '12px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px', border: 'none', cursor: 'pointer' }}
                onClick={() => {
                  setShowPayNowModal(false);
                  setShowOnlinePayment(false);
                  handlePaymentSuccess("Payment Received!");
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <span style={{ color: '#fff', fontSize: '15px', fontWeight: '800' }}>Payment Received</span>
              </button>

              <button
                style={{ width: '100%', padding: '6px', alignItems: 'center', display: 'flex', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer' }}
                onClick={() => setShowPayNowModal(false)}
              >
                <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>Cancel Transaction</span>
              </button>

            </div>
          </div>
        </div>
      )}

      {showUpiModal && (
        <div className="modal-overlay" style={{ zIndex: 10002 }}>
          <div style={{ width: '100%', maxWidth: '320px', backgroundColor: '#fff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '800', color: '#1f2937' }}>UPI QR Payment</div>
                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>AL-HAZIMA RESTAURANT PTE LTD</div>
                </div>
                <button
                  style={{ border: 'none', background: '#F1F5F9', borderRadius: '10px', padding: '6px', cursor: 'pointer', display: 'flex' }}
                  onClick={() => setShowUpiModal(false)}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#1f2937" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
              </div>

              {/* Amount Box */}
              <div style={{ backgroundColor: '#F8FAFC', padding: '10px', borderRadius: '12px', alignItems: 'center', marginBottom: '16px', border: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: '600', marginBottom: '2px' }}>Total Amount to Collect</div>
                <div style={{ fontSize: '22px', fontWeight: '900', color: '#f97316' }}>${totalAmount}</div>
              </div>

              {/* QR Code Container */}
              {/* <div style={{ alignItems: 'center', marginBottom: '10px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ width: '160px', height: '160px', padding: '10px', backgroundColor: '#fff', borderRadius: '16px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <QRCodeSVG value={`upi://pay?pa=${upiUpiId || 'merchant@upi'}&pn=Merchant&am=${totalAmount}&cu=INR`} size={140} />
                </div>
                <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', fontWeight: '500', textAlign: 'center' }}>
                  Ask customer to scan with any UPI App
                </div>
                {upiUpiId && <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '2px' }}>UPI: {upiUpiId}</div>}
              </div> */}

              {/* Action Buttons */}
              <button
                style={{ width: '100%', display: 'flex', backgroundColor: '#22c55e', padding: '12px', borderRadius: '12px', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '10px', border: 'none', cursor: 'pointer' }}
                onClick={() => {
                  setShowUpiModal(false);
                  setShowOnlinePayment(false);
                  handlePaymentSuccess("Payment Received!");
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                <span style={{ color: '#fff', fontSize: '15px', fontWeight: '800' }}>Payment Received</span>
              </button>

              <button
                style={{ width: '100%', padding: '6px', alignItems: 'center', display: 'flex', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer' }}
                onClick={() => setShowUpiModal(false)}
              >
                <span style={{ color: '#ef4444', fontSize: '13px', fontWeight: '600' }}>Cancel Transaction</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettingsModal && (
        <div className="modal-overlay" style={{ zIndex: 10003 }}>
          <div className="modal-content" style={{ maxWidth: '420px', display: 'flex', flexDirection: 'column' }}>
            <div className="modal-header">
              <h2 className="modal-title">Payment Settings</h2>
              <button className="modal-close" onClick={() => setShowSettingsModal(false)}>&times;</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

              <div style={{ border: '1px solid #eee', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#333' }}>PayNow UPI ID</h3>
                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#6b7280' }}>Enter your PayNow / UPI ID. The QR will be generated dynamically with the correct amount.</p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {

                    const file = e.target.files[0];

                    const reader = new FileReader();

                    reader.onloadend = () => {

                      const base64 = reader.result.split(",")[1];

                      setTempPaynowUpiId(base64);
                    };

                    if (file) {
                      reader.readAsDataURL(file);
                    }

                  }}
                />
                {/* {tempPaynowUpiId && (
                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                    <QRCodeSVG
  value={
    tempPaynowUpiId &&
    tempPaynowUpiId.length < 100
      ? `upi://pay?pa=${tempPaynowUpiId}&pn=Merchant&am=1&cu=INR`
      : "upi://pay?pa=test@upi&pn=Merchant&am=1&cu=INR"
  }
  size={100}
/>
                  </div>
                )} */}
              </div>

              {/* <div style={{ border: '1px solid #eee', borderRadius: '12px', padding: '16px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '14px', color: '#333' }}>GPay / UPI ID</h3>
                <p style={{ margin: '0 0 10px 0', fontSize: '12px', color: '#6b7280' }}>Enter your GPay / UPI ID. The QR will include the exact order amount when shown at checkout.</p>
                <input
                  type="text"
                  placeholder="e.g. 9876543210@superyes"
                  value={tempUpiUpiId}
                  onChange={(e) => setTempUpiUpiId(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
                />
                {tempUpiUpiId && (
                  <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'center' }}>
                    <QRCodeSVG value={`upi://pay?pa=${tempUpiUpiId}&pn=Merchant&am=1&cu=INR`} size={100} />
                  </div>
                )}
              </div> */}

            </div>
            <div className="modal-footer" style={{ display: 'flex', gap: '10px' }}>
              <button className="btn-cancel" onClick={() => setShowSettingsModal(false)}>Cancel</button>
              <button className="btn-add" style={{ flex: 1 }} onClick={() => {
                saveUpiId('paynow', tempPaynowUpiId);
                saveUpiId('upi', tempUpiUpiId);
                setShowSettingsModal(false);
              }}>Save Settings</button>
            </div>
          </div>
        </div>
      )}
          </div>
      }
    />

    <Route
      path="/settlement-success"
      element={<SettlementSuccess />}
    />

  </Routes>
);
}

export default App;