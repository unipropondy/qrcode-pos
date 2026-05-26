import React, { useEffect, useState } from "react";
import { BASE_URL } from "./Configs/api";
import "./SettlementSuccess.css";
import { Home } from "lucide-react";
import { useNavigate } from "react-router-dom";


function SettlementSuccess() {

  const API = `${BASE_URL}/api`;

  const navigate = useNavigate();
const [tableId, setTableId] = useState("");
  const [orders, setOrders] = useState([]);

  const [orderNumber, setOrderNumber] = useState("");

  const [tableNo, setTableNo] = useState("");

  useEffect(() => {
    loadOrderDetails();
  }, []);

  const loadOrderDetails = async () => {

    try {

      const params = new URLSearchParams(window.location.search);

      const orderId = params.get("orderId");

          setTableId(params.get("tableId") || "");

      const res = await fetch(
        `${API}/order/order-details/${orderId}`
      );

      const data = await res.json();

      setOrders(data);

      if (data.length > 0) {

        setOrderNumber(data[0].OrderNumber);

        setTableNo(data[0].Tableno || "2");

      }

    } catch (err) {

      console.log(err);

    }
  };

  const totalQty = orders.reduce(
    (s, i) => s + Number(i.Quantity || 0),
    0
  );

  return (

    <div className="settlement-success-page">

      <div className="settlement-success-card">

        {/* TOP GREEN LINE */}
        <div className="settlement-top-line"></div>

        {/* HEADER */}
       <div className="settlement-header-section">

            <div>

              <h1 className="settlement-table-title">
                Section-1 • Table {tableNo}
              </h1>

              <div className="settlement-order-number">
                #{orderNumber}
              </div>

            </div>

           <button
            className="settlement-home-btn"
            onClick={() => {
              navigate(`/?tableId=${tableId}&table=${tableNo}`);
            }}
          >
            🏠
          </button>

          </div>

        {/* BADGES */}
        <div className="settlement-badge-row">

          <div className="settlement-info-badge green">

            <span>🍽</span>

            <span>{totalQty} items</span>

          </div>

          <div className="settlement-info-badge gray">

            <span>🍴</span>

            <span>{orders.length} dishes</span>

          </div>

        </div>

        {/* DIVIDER */}
        <div className="settlement-divider"></div>

        {/* KITCHEN TITLE */}
        <div className="settlement-kitchen-title">
          KITCHEN
        </div>

        {/* ORDER ITEMS */}
        <div className="settlement-items-list">

          {orders.map((item, index) => (

            <div
              className="settlement-order-item"
              key={index}
            >

              <div className="settlement-qty-box">
                {item.Quantity}x
              </div>

              <div className="settlement-item-content">

                <div className="settlement-dish-top">

                  <div className="settlement-dish-name">
                    {item.DishName}
                  </div>

                  <div className="settlement-item-price">
                    ${Number(item.Price || 0).toFixed(2)}
                  </div>

                </div>

                <div className="settlement-status-row">

                  <div className="settlement-status preparing">
                    Preparing
                  </div>

                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>

  );
}

export default SettlementSuccess;