// ==========================================
// 1. CẤU HÌNH CƠ BẢN & BIẾN TOÀN CỤC
// ==========================================
const API_URL = "https://api-kho.quangtriet430.workers.dev";
let user = null;
let cart = [];
let inventoryData = [];
let nccData = [];
let allTransactions = [];
let syncInterval = null; // Biến giữ vòng lặp đồng bộ
let isFetchingData = false;
// Biến tạm để giữ thông tin user đang chờ đổi pass
let pendingUser = null;
let tenThongDungData = [];
let currentApproveTxId = null; // Biến lưu ID phiếu đang chờ VP duyệt

window.onload = checkAuth;

// --- TIỆN ÍCH UI ---
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast-${type}`;
  toast.innerText = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

let _loadingOverlay = null;
function showLoadingSpinner() {
  if (_loadingOverlay) return;
  _loadingOverlay = document.createElement("div");
  _loadingOverlay.className = "app-loading-overlay";
  _loadingOverlay.innerHTML = `<div class="app-spinner"></div>`;
  document.body.appendChild(_loadingOverlay);
}
function hideLoadingSpinner() {
  if (_loadingOverlay) {
    _loadingOverlay.remove();
    _loadingOverlay = null;
  }
}

function togglePassword() {
  const passInput = document.getElementById("password");
  const toggleIcon = document.getElementById("toggleIcon");
  if (passInput.type === "password") {
    passInput.type = "text";
    toggleIcon.innerText = "🔐";
  } else {
    passInput.type = "password";
    toggleIcon.innerText = "🔒";
  }
}

// ==========================================
// 2. HỆ THỐNG ĐĂNG NHẬP & PHÂN QUYỀN
// ==========================================
async function login() {
  const ma_nv = document.getElementById("username").value.toUpperCase().trim();
  const password = String(document.getElementById("password").value);

  if (!ma_nv || !password) return alert("Vui lòng nhập đủ thông tin!");

  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ma_nv, password }),
    });

    if (res.ok) {
      const loggedInUser = await res.json();

      // KIỂM TRA MẬT KHẨU MẶC ĐỊNH
      if (password === "123") {
        pendingUser = loggedInUser;
        document.getElementById("changePassModal").classList.remove("hidden");
      } else {
        // Đăng nhập bình thường
        user = loggedInUser;
        localStorage.setItem("user", JSON.stringify(user));
        checkAuth();
      }
    } else {
      alert("Sai tài khoản hoặc mật khẩu!");
    }
  } catch (e) {
    alert("Lỗi kết nối máy chủ! Hãy kiểm tra mạng hoặc link API.");
  }
}

async function submitChangePassword() {
  const newPass = document.getElementById("newPassword").value;
  const confirmPass = document.getElementById("confirmPassword").value;

  if (!newPass || !confirmPass) return alert("Vui lòng nhập đầy đủ mật khẩu!");
  if (newPass === "123")
    return alert("Mật khẩu mới không được giống mật khẩu mặc định!");
  if (newPass !== confirmPass) return alert("Mật khẩu xác nhận không khớp!");

  showLoadingSpinner();
  try {
    const res = await fetch(`${API_URL}/api/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ma_nv: pendingUser.ma_nv,
        new_password: newPass,
      }),
    });

    if (res.ok) {
      showToast("Đổi mật khẩu thành công!");
      document.getElementById("changePassModal").classList.add("hidden");

      // Cập nhật pass mới vào đối tượng user và cho phép vào hệ thống
      pendingUser.password = newPass;
      user = pendingUser;
      localStorage.setItem("user", JSON.stringify(user));

      // Dọn dẹp form
      document.getElementById("newPassword").value = "";
      document.getElementById("confirmPassword").value = "";
      pendingUser = null;

      checkAuth();
    } else {
      alert("Lỗi khi đổi mật khẩu!");
    }
  } catch (e) {
    alert("Lỗi kết nối máy chủ!");
  } finally {
    hideLoadingSpinner();
  }
}

function logout() {
  localStorage.removeItem("user");
  user = null;
  if (syncInterval) clearInterval(syncInterval);
  window.location.href = "index.html";
}

function checkAuth() {
  const savedUser = localStorage.getItem("user");
  const currentPage = window.location.pathname;

  if (savedUser) {
    user = JSON.parse(savedUser);
    document.getElementById("loginView")?.classList.add("hidden");
    document.getElementById("mainView")?.classList.remove("hidden");

    const userInfoEl = document.getElementById("userInfo");
    if (userInfoEl) userInfoEl.innerText = `Xin chào, ${user.ten_nv}`;

    const txDateEl = document.getElementById("txDate");
    if (txDateEl) txDateEl.valueAsDate = new Date();

    const itemVP = document.getElementById("itemSelectVP");
    const itemXuong = document.getElementById("itemSelectXuong");
    const plSelect = document.getElementById("phanLoaiSelect");
    const filterZone = document.getElementById("filterZone");

    if (user.bo_phan === "XUONG") {
      document.getElementById("btn-tab-vattu")?.classList.add("hidden");
      document.getElementById("btn-tab-ncc")?.classList.add("hidden");
      document.getElementById("btn-tab-baocao")?.classList.add("hidden");

      // Set giao diện nhập liệu XƯỞNG
      if (plSelect) {
        plSelect.style.display = "none";
        plSelect.value = "Khác";
        plSelect.dispatchEvent(new Event("input"));
      }
      if (itemVP) itemVP.style.display = "none";
      if (itemXuong) {
        itemXuong.style.display = "block";
        itemXuong.classList.remove("hidden");
      }
      if (filterZone) filterZone.style.display = "none";
      document
        .querySelectorAll(".vp-only")
        .forEach((el) => (el.style.display = "none"));
    } else {
      document.getElementById("btn-tab-vattu")?.classList.remove("hidden");
      document.getElementById("btn-tab-ncc")?.classList.remove("hidden");
      document.getElementById("btn-tab-baocao")?.classList.remove("hidden");

      // Set giao diện nhập liệu VĂN PHÒNG
      if (plSelect) plSelect.style.display = "block";
      if (itemVP) itemVP.style.display = "block";
      if (itemXuong) itemXuong.style.display = "none";

      if (filterZone) filterZone.style.display = "block";
      document
        .querySelectorAll(".vp-only")
        .forEach((el) => (el.style.display = "table-cell"));
    }

    setupTransactionTypes();
    loadInitialData(false);

    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => loadInitialData(true), 10000);
  } else {
    if (syncInterval) clearInterval(syncInterval);
    if (
      !currentPage.endsWith("index.html") &&
      currentPage !== "/" &&
      !currentPage.endsWith("io.vn/")
    ) {
      window.location.href = "index.html";
      return;
    }
    document.getElementById("loginView")?.classList.remove("hidden");
    document.getElementById("mainView")?.classList.add("hidden");
  }
}

// ==========================================
// 3. ĐIỀU KHIỂN GIAO DIỆN
// ==========================================
function switchTab(tabId) {
  document.querySelectorAll(".tab-content").forEach((tab) => {
    tab.classList.remove("active");
    tab.classList.add("hidden");
  });
  document
    .querySelectorAll(".nav-btn")
    .forEach((btn) => btn.classList.remove("active"));

  const targetTab = document.getElementById(tabId);
  if (targetTab) {
    targetTab.classList.remove("hidden");
    targetTab.classList.add("active");
  }
  const targetBtn = document.getElementById(`btn-${tabId}`);
  if (targetBtn) targetBtn.classList.add("active");

  // Chủ động gọi đồng bộ ngầm khi qua Tab duyệt/lịch sử để có data nóng ngay lập tức
  loadInitialData(true);
}

function switchSubTab(parent, target) {
  document
    .querySelectorAll(`#tab-${parent} .sub-btn`)
    .forEach((btn) => btn.classList.remove("active"));
  document.getElementById(`btn-${parent}-${target}`).classList.add("active");
  document
    .querySelectorAll(`#tab-${parent} .sub-content`)
    .forEach((content) => {
      content.classList.add("hidden");
      content.classList.remove("active");
    });
  const targetContent = document.getElementById(`${parent}-${target}`);
  if (targetContent) {
    targetContent.classList.remove("hidden");
    targetContent.classList.add("active");
  }
}

function closeModal() {
  document.getElementById("itemDetailModal").classList.add("hidden");
}

// FIX MÚI GIỜ
function formatShortDate(dateString) {
  if (!dateString) return "";
  // Xóa bỏ đoạn mã ép giờ Z cũ đi, chỉ giữ lại parse cơ bản
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString; // Tránh lỗi nếu chuỗi rỗng

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yy} ${hh}:${min}`;
}

// ==========================================
// 4. KÉO DỮ LIỆU TỪ SERVER & HIỂN THỊ
// ==========================================
async function loadInitialData(isSilent = false) {
  if (isFetchingData) return; // Tránh gọi API chồng chéo nếu mạng chậm
  isFetchingData = true;

  try {
    if (!isSilent) showLoadingSpinner();
    const url = `${API_URL}/api/data?t=${new Date().getTime()}`;
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      inventoryData = data.items;
      nccData = data.nccs;
      allTransactions = data.txs;
      tenThongDungData = data.ten_thong_dung || []; // <-- THÊM DÒNG NÀY

      // THAY ĐỔI Ở ĐÂY: Dùng lại các hàm filter để giữ nguyên trạng thái UI đang search
      if (typeof filterSupplier === "function") filterSupplier();
      else renderSupplierTable(data.nccs);
      filterInventory();
      applyHistoryFilter();

      // Chỉ vẽ lại Form Dropdown khi không chạy ngầm để tránh gián đoạn form
      if (!isSilent) {
        populateDropdowns(data.items, data.nccs, data.san_pham_sx);
      }
    } else {
      // Giữ lại phần log lỗi từ đoạn 1 để dễ debug
      console.log("Server trả về lỗi:", res.status);
    }
  } catch (error) {
    console.log("Lỗi tải dữ liệu:", error);
  } finally {
    if (!isSilent) hideLoadingSpinner();
    isFetchingData = false;
  }
}

function populateDropdowns(items, nccs, san_pham_sx) {
  const plSelect = document.getElementById("phanLoaiSelect");

  if (plSelect) {
    // Dùng oninput thay vì onchange để lướt mượt hơn
    plSelect.oninput = function () {
      const pl = this.value;

      // Lọc danh sách kho chuẩn
      let filteredItems = inventoryData.filter(
        (i) => !pl || i.phan_loai === pl,
      );

      // Phân luồng giao diện đổ dữ liệu
      if (user && user.bo_phan !== "XUONG") {
        // VĂN PHÒNG: Đổ data vào thẻ <select>. Hiện rõ "Mã | Tên" cho họ dễ chọn
        const itemSelectVP = document.getElementById("itemSelectVP");
        if (itemSelectVP) {
          let vpOptions = `<option value="">- Chọn Tên Dụng Cụ (Chuẩn) -</option>`;
          vpOptions += filteredItems
            .map(
              (i) =>
                `<option value="${i.ten_hang}">${i.ma_hang} | ${i.ten_hang}</option>`,
            )
            .join("");
          itemSelectVP.innerHTML = vpOptions;
          itemSelectVP.value = "";
        }
      } else {
        // XƯỞNG: Đổ data vào <datalist> (bao gồm cả kho chuẩn và tên lóng)
        const dataItems = document.getElementById("dataItems");
        const itemSelectXuong = document.getElementById("itemSelectXuong");
        if (dataItems && itemSelectXuong) {
          let filteredThongDung = tenThongDungData.filter(
            (t) => !pl || t.phan_loai === pl,
          );
          let allNames = new Set();

          filteredItems.forEach((i) => allNames.add(i.ten_hang));
          filteredThongDung.forEach((t) => allNames.add(t.ten_goi));

          let xuongOptions = Array.from(allNames)
            .map((name) => `<option value="${name}"></option>`)
            .join("");
          dataItems.innerHTML = xuongOptions;
          itemSelectXuong.value = "";
        }
      }
    };

    // Kích hoạt mồi lần đầu
    plSelect.dispatchEvent(new Event("input"));
  }

  // Khúc sản phẩm và NCC (Giữ nguyên tối ưu)
  const dataNccs = document.getElementById("dataNccs");
  if (dataNccs) {
    dataNccs.innerHTML = nccs
      .map((n) => `<option value="${n.ten_ncc}"></option>`)
      .join("");
  }

  const productSelect = document.getElementById("productSelect");
  if (productSelect) {
    let spOptions = [
      '<option value="">-- Dùng cho mã hàng nào? (Không bắt buộc) --</option>',
    ];
    san_pham_sx.forEach((sp) => {
      spOptions.push(`<option value="${sp.ma_sp}">${sp.ten_sp}</option>`);
    });
    productSelect.innerHTML = spOptions.join("");
  }
}

function renderSupplierTable(nccs) {
  const tbody = document.querySelector("#nccTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  nccs.slice(0, 100).forEach((ncc) => {
    const tr = document.createElement("tr");
    tr.onclick = () => showNccDetail(ncc.ma_ncc);

    // Lấy đúng key so_dt từ Database
    const sdtHienThi = ncc.so_dt || ncc.sdt || "";

    tr.innerHTML = `
            <td>${ncc.ma_ncc}</td>
            <td>${ncc.ten_ncc}</td>
            <td>${ncc.dia_chi || ""}</td>
            <td>${sdtHienThi}</td>
            <td>${ncc.nguoi_lien_he || ""}</td>
            <td>${ncc.email || ""}</td>
            <td>${ncc.ghi_chu || ""}</td>
            <td class="no-print act-col">
                <button onclick="openEditNcc('${ncc.ma_ncc}', event)" class="primary btn-sm" style="margin-bottom:4px;">Sửa</button>
                <button onclick="deleteNcc('${ncc.ma_ncc}', event)" class="danger btn-sm">Xóa</button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

function renderInventoryTable(items, limit = 50) {
  const tbody = document.querySelector("#inventoryTable tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Nếu limit > 0 thì cắt mảng, nếu = 0 thì lấy toàn bộ
  const dataToRender = limit > 0 ? items.slice(0, limit) : items;

  if (dataToRender.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;">Không tìm thấy dụng cụ nào!</td></tr>`;
    return;
  }

  dataToRender.forEach((item) => {
    const tr = document.createElement("tr");
    tr.style.cursor = "pointer";
    tr.onclick = () => showItemDetail(item.ma_hang);

    tr.innerHTML = `
            <td>${item.ma_hang}</td>
            <td>${item.ten_hang}</td>
            <td style="color: var(--primary); font-weight: 500;">${item.phan_loai || "-"}</td>
            <td>${item.don_vi_tinh || ""}</td>
            <td style="color: var(--success); font-weight:bold;">${item.sl_ton_moi || 0}</td>
            <td style="color: #c2c1c5; font-weight:bold;">${item.sl_dang_muon || 0}</td>
            <td style="color: #64748b; font-weight:bold;">${item.sl_ton_cu || 0}</td>
            <td style="color: var(--accent); font-weight:bold;">${item.sl_dang_gc || 0}</td>            
            <td style="color: var(--danger); font-weight:bold;">${item.sl_thanh_ly || 0}</td>
            <td class="no-print act-col">
                <!-- Thêm event.stopPropagation() để không bị kích hoạt showItemDetail khi bấm Sửa/Xóa -->
                <button onclick="event.stopPropagation(); openEditItem('${item.ma_hang}', event)" class="primary btn-sm" style="margin-bottom:4px;">Sửa</button>
                <button onclick="event.stopPropagation(); deleteItem('${item.ma_hang}', event)" class="danger btn-sm">Xóa</button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

// Bảng lịch sử (Đã ẩn Tiền, PO, Hóa Đơn đối với Xưởng)
function renderHistoryTable(transactions, limit = 50) {
  const tbody = document.querySelector("#txTable tbody");
  if (!tbody) return;

  const dataToRender = limit > 0 ? transactions.slice(0, limit) : transactions;

  if (dataToRender.length === 0) {
    tbody.innerHTML = `<tr><td colspan="13" style="text-align:center;">Không có giao dịch nào!</td></tr>`;
    return;
  }

  // 1. KIỂM TRA QUYỀN: Là Văn Phòng thì true, là Xưởng thì false
  const isVP = user.bo_phan !== "XUONG";

  // 2. ẨN/HIỆN TIÊU ĐỀ CỘT TRÊN HTML
  // (Đại ca nhớ thêm id="th-sohd" và id="th-sopo" vào 2 thẻ <th> tương ứng bên file HTML nhé)
  const thDonGia = document.getElementById("th-dongia");
  const thThanhTien = document.getElementById("th-thanhtien");
  const thSoHD = document.getElementById("th-sohd");
  const thSoPO = document.getElementById("th-sopo");

  if (thDonGia) thDonGia.style.display = isVP ? "" : "none";
  if (thThanhTien) thThanhTien.style.display = isVP ? "" : "none";
  if (thSoHD) thSoHD.style.display = isVP ? "" : "none";
  if (thSoPO) thSoPO.style.display = isVP ? "" : "none";

  let htmlRows = [];
  let totalSL = 0;
  let totalTien = 0;

  dataToRender.forEach((tx) => {
    totalSL += parseInt(tx.so_luong) || 0;
    totalTien += parseInt(tx.thanh_tien) || 0;

    let donGiaFmt = tx.don_gia ? tx.don_gia.toLocaleString() : "-";
    let thanhTienFmt = tx.thanh_tien ? tx.thanh_tien.toLocaleString() : "-";

    let statusText =
      tx.trang_thai === "pending"
        ? "Chờ duyệt"
        : tx.trang_thai === "approved"
          ? "Đã duyệt"
          : "Từ chối";
    let statusColor =
      tx.trang_thai === "pending"
        ? "var(--warning)"
        : tx.trang_thai === "approved"
          ? "var(--success)"
          : "var(--danger)";

    let actionHtml = "";
    if (isVP) {
      if (tx.trang_thai === "pending") {
        actionHtml = `<button onclick="openApproveModal(${tx.id})" class="primary btn-sm">Xử lý phiếu</button>`;
      } else {
        actionHtml = `<span class="text-muted" style="font-size: 13px;">Đã xử lý</span>`;
      }
    }

    let l_mh = tx.ten_hang || tx.ten_vt || tx.ma_hang || tx.ma_vt;
    let l_sp = tx.ten_sp_sx || tx.ten_sp || tx.ma_sp_sx || tx.ma_sp || "-";
    let l_gd = tx.loai_giao_dich || tx.loai_gd;
    let l_hd = tx.so_hd || tx.so_hoa_don || "-";
    let l_po = tx.so_po || "-";

    let l_chuan = tx.ten_chuan || "-";
    if (tx.trang_thai === "pending" && tx.ma_hang === "CHO_MAP") {
      l_chuan = "⏳ Chờ xử lý";
    }

    // 3. GỘP CHUNG 4 CỘT DÀNH RIÊNG CHO VĂN PHÒNG
    let cotVanPhongHtml = isVP
      ? `
        <td>${l_hd}</td>
        <td>${l_po}</td>
        <td>${donGiaFmt}</td>
        <td style="color: var(--danger); font-weight:bold;">${thanhTienFmt}</td>
    `
      : "";

    htmlRows.push(`
      <tr>
        <td>${formatShortDate(tx.thoi_gian_gd || tx.created_at)}</td>
        <td>${tx.nguoi_giao_dich || tx.ma_nv}</td>
        <td>${l_mh}</td>
        <td style="color: var(--primary); font-weight: 500;">${l_chuan}</td>
        <td>${l_gd}</td>
        <td>${tx.so_luong}</td>
        <td>${l_sp}</td>
        ${cotVanPhongHtml} <!-- Nhúng 4 cột của VP vào đây -->
        <td style="color: ${statusColor}; font-weight: bold;">${statusText}</td>
        <td class="no-print act-col">${actionHtml}</td>
      </tr>
    `);
  });

  // 4. XỬ LÝ GỘP CỘT (COLSPAN) CHO DÒNG TỔNG CỘNG
  let totalRowTienHtml = isVP
    ? `
      <td colspan="4"></td> <!-- VP cách 4 cột: Sản phẩm, HD, PO, Đơn giá -->
      <td style="color: #e11d48; font-size: 14px;">${totalTien.toLocaleString("vi-VN")}</td>
      <td colspan="2"></td> <!-- VP cách 2 cột cuối: Trạng thái, Thao tác -->
  `
    : `
      <td colspan="3"></td> <!-- Xưởng bị ẩn 4 cột giữa nên chỉ còn 3 cột cuối: Sản phẩm, Trạng thái, Thao tác -->
  `;

  htmlRows.push(`
    <tr style="font-weight: bold; background-color: #e2e8f0;">
      <td colspan="5" style="text-align: right; color: #334155;">TỔNG CỘNG:</td>
      <td style="color: var(--danger); font-size: 14px;">${totalSL.toLocaleString("vi-VN")}</td>
      ${totalRowTienHtml}
    </tr>
  `);

  tbody.innerHTML = htmlRows.join("");
}
// Phê duyệt phiếu
async function processApproval(id, action) {
  const actionName = action === "approve" ? "DUYỆT" : "TỪ CHỐI";
  if (!confirm(`Bạn có chắc chắn muốn ${actionName} phiếu này không?`)) return;

  const idx = allTransactions.findIndex((t) => t.id === id);
  if (idx === -1) return;
  const oldStatus = allTransactions[idx].trang_thai;
  const tx = allTransactions[idx];
  const item = inventoryData.find((i) => i.ma_hang === tx.ma_hang);

  // 1. Cập nhật trạng thái phiếu NGAY trên giao diện
  allTransactions[idx].trang_thai =
    action === "approve" ? "approved" : "rejected";
  renderHistoryTable(allTransactions);

  // 2. Cập nhật tồn kho NGAY — đúng theo logic route /api/approve ở Worker:
  //    - Duyệt "Xưởng mượn" -> cộng sl_dang_muon (vế còn lại của giao dịch mượn)
  //    - Duyệt "Xưởng trả"  -> cộng sl_ton_cu   (hàng trả về tính là hàng CŨ, không phải kho mới)
  //    - Từ chối -> hoàn lại đúng phần đã trừ tạm lúc submit (rollback vế đã trừ)
  const applyInventoryEffect = (sign) => {
    if (!item) return;
    if (action === "approve") {
      if (tx.loai_giao_dich === "Xưởng mượn")
        item.sl_dang_muon = (item.sl_dang_muon || 0) + sign * tx.so_luong;
      if (tx.loai_giao_dich === "Xưởng trả")
        item.sl_ton_cu = (item.sl_ton_cu || 0) + sign * tx.so_luong;
    } else {
      if (tx.loai_giao_dich === "Xưởng mượn")
        item.sl_ton_moi = (item.sl_ton_moi || 0) + sign * tx.so_luong;
      if (tx.loai_giao_dich === "Xưởng trả")
        item.sl_dang_muon = (item.sl_dang_muon || 0) + sign * tx.so_luong;
    }
    renderInventoryTable(inventoryData);
  };
  applyInventoryEffect(1);

  try {
    const res = await fetch(`${API_URL}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });

    if (res.ok) {
      showToast(`Đã ${actionName} phiếu thành công!`);
    } else {
      // Server từ chối request -> rollback cả trạng thái lẫn tồn kho
      allTransactions[idx].trang_thai = oldStatus;
      renderHistoryTable(allTransactions);
      applyInventoryEffect(-1);
      showToast("Lỗi! Không thể xử lý phiếu lúc này.", "error");
    }
  } catch (e) {
    allTransactions[idx].trang_thai = oldStatus;
    renderHistoryTable(allTransactions);
    applyInventoryEffect(-1);
    showToast("Lỗi kết nối máy chủ Cloudflare!", "error");
  }
}

// ==========================================
// 5. GIAO DỊCH, THÊM VÀO GIỎ & GỬI PHIẾU (ĐÃ ĐƯỢC KHÔI PHỤC LẠI)
// ==========================================
function setupTransactionTypes() {
  const typeSelect = document.getElementById("typeSelect");
  if (!typeSelect) return;
  typeSelect.innerHTML = "";

  const typesVP = [
    { value: "Nhập mới", label: "Nhập DC mới" },
    { value: "Xuất GC", label: "Xuất DC GC" },
    { value: "Nhập GC", label: "Nhập Gia công về" },
    { value: "Xuất thanh lý", label: "Xuất DC thanh lý" },
  ];
  const typesXuong = [
    { value: "Xưởng mượn", label: "Xưởng mượn" },
    { value: "Xưởng trả", label: "Xưởng trả" },
  ];

  let types = user.bo_phan === "XUONG" ? typesXuong : typesVP;
  types.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.value;
    opt.innerText = t.label;
    typeSelect.appendChild(opt);
  });

  typeSelect.addEventListener("change", function () {
    const type = this.value;
    const txNcc = document.getElementById("txNcc");
    const extraFields = document.getElementById("extraFields");

    if (["Nhập mới", "Nhập GC", "Xuất GC"].includes(type)) {
      if (txNcc) {
        txNcc.classList.remove("hidden");
        txNcc.style.display = "block";
      }
    } else {
      if (txNcc) {
        txNcc.classList.add("hidden");
        txNcc.style.display = "none";
        txNcc.value = "";
      }
    }

    if (user.bo_phan !== "XUONG") {
      if (extraFields) extraFields.style.display = "block";
    } else {
      if (extraFields) extraFields.style.display = "none";
    }
  });

  typeSelect.dispatchEvent(new Event("change"));
}

function addToList() {
  try {
    const plSelect = document.getElementById("phanLoaiSelect");
    const typeSelect = document.getElementById("typeSelect");
    const txNcc = document.getElementById("txNcc");
    const productSelect = document.getElementById("productSelect");
    const qtyInput = document.getElementById("qtyInput");
    const noteInput = document.getElementById("noteInput");
    const hdInput = document.getElementById("soHoaDonInput");
    const poInput = document.getElementById("soPOInput");
    const priceInput = document.getElementById("donGiaInput");
    const txDateEl = document.getElementById("txDate");

    // 1. LẤY DỮ LIỆU PHÂN LOẠI & TÊN VẬT TƯ THÔNG MINH
    let phan_loai = plSelect ? plSelect.value : "";
    let ten_vt = "";
    let itemSelectElement = null; // Biến giữ ô đang dùng để xíu nữa reset

    if (user && user.bo_phan === "XUONG") {
      phan_loai = "Khác"; // Ép Xưởng dùng phân loại Khác
      itemSelectElement = document.getElementById("itemSelectXuong");
      ten_vt = itemSelectElement ? itemSelectElement.value.trim() : "";
    } else {
      itemSelectElement = document.getElementById("itemSelectVP");
      ten_vt = itemSelectElement ? itemSelectElement.value : "";
    }

    const loai_gd = typeSelect.value;
    const so_luong = parseInt(qtyInput.value);

    // Kiểm tra tính hợp lệ
    if (user && user.bo_phan !== "XUONG" && !phan_loai) {
      return alert("Vui lòng chọn Nhóm Phân Loại trước!");
    }
    if (!ten_vt || !loai_gd || !qtyInput.value) {
      return alert("Vui lòng chọn mặt hàng, loại giao dịch và nhập số lượng!");
    }
    if (so_luong < 1 || isNaN(so_luong)) {
      return alert("Lỗi: Số lượng giao dịch phải lớn hơn 0!");
    }

    // 2. DÒ TÌM DATABASE ĐỂ LẤY MÃ CHUẨN
    let ma_vt = "CHO_MAP";
    if (typeof inventoryData !== "undefined" && inventoryData.length > 0) {
      const itemDb = inventoryData.find(
        (i) => i.ten_hang.toLowerCase() === ten_vt.toLowerCase(),
      );

      if (itemDb) {
        ma_vt = itemDb.ma_hang;
        ten_vt = itemDb.ten_hang; // Chuẩn hóa lại tên nếu gõ sai hoa/thường
      } else {
        // Chốt chặn Văn Phòng: Cấm thêm nếu tên không có trong kho!
        if (user && user.bo_phan !== "XUONG") {
          return alert(
            `LỖI: Không tìm thấy "${ten_vt}" trong kho chuẩn!\n\nVui lòng chọn đúng tên từ danh sách gợi ý. Nếu là dụng cụ mới, hãy tạo mã trước!`,
          );
        }
      }
    }

    // 3. KHỞI TẠO TIỀN & CHỨNG TỪ
    let don_gia =
      priceInput && priceInput.value ? parseInt(priceInput.value) : 0;
    let thanh_tien = don_gia * so_luong;
    const tx_date = txDateEl ? txDateEl.value : "";

    let valHD = hdInput && hdInput.value ? hdInput.value.trim() : "";
    let valPO = poInput && poInput.value ? poInput.value.trim() : "";
    let chungTuGop = valHD;
    if (valPO)
      chungTuGop = chungTuGop ? `${valHD} (PO: ${valPO})` : `PO: ${valPO}`;

    let ten_sp_hien_thi = "";
    if (productSelect && productSelect.selectedIndex > 0) {
      ten_sp_hien_thi = productSelect.options[productSelect.selectedIndex].text;
    }

    // 4. ĐẨY VÀO GIỎ HÀNG
    cart.push({
      phan_loai: phan_loai,
      ma_vt: ma_vt,
      ten_vt: ten_vt,
      loai_gd: loai_gd,
      so_luong: so_luong,
      ncc: txNcc && !txNcc.classList.contains("hidden") ? txNcc.value : "",
      ma_sp: productSelect ? productSelect.value : "",
      ten_sp: ten_sp_hien_thi,
      so_chung_tu: chungTuGop,
      so_hd: valHD,
      so_po: valPO,
      don_gia: don_gia,
      thanh_tien: thanh_tien,
      ghi_chu: noteInput ? noteInput.value : "",
      tx_date: tx_date,
    });

    updateCartTable();

    // 5. RESET FORM
    qtyInput.value = "";
    if (noteInput) noteInput.value = "";
    if (hdInput) hdInput.value = "";
    if (poInput) poInput.value = "";
    if (priceInput) priceInput.value = "";

    // Reset ô chọn tên ứng với quyền đang dùng
    if (itemSelectElement) {
      itemSelectElement.value = "";
      itemSelectElement.dispatchEvent(new Event("input"));
    }
  } catch (error) {
    alert("Hệ thống phát hiện lỗi: " + error.message);
    console.error(error);
  }
}

function updateCartTable() {
  const tbody = document.querySelector("#cartTable tbody");
  tbody.innerHTML = "";
  const isXUONG = user && user.bo_phan === "XUONG";
  const displayStyle = isXUONG ? "display: none;" : "display: table-cell;";
  cart.forEach((item, index) => {
    const tr = document.createElement("tr");

    let donGiaFmt =
      item.don_gia > 0 ? Number(item.don_gia).toLocaleString("vi-VN") : "-";
    let thanhTienFmt =
      item.thanh_tien > 0
        ? Number(item.thanh_tien).toLocaleString("vi-VN")
        : "-";

    tr.innerHTML = `
            <td>${item.ten_vt}</td>
            <td>${item.loai_gd} ${item.ncc ? `(NCC: ${item.ncc})` : ""}</td>
            <td>${item.so_luong}</td>
            <td style="${displayStyle}">${item.ten_sp || "-"}</td> 
            <td style="${displayStyle}">${item.so_hd || "-"}</td>
            <td style="${displayStyle}">${item.so_po || "-"}</td>
            <td style="${displayStyle}">${donGiaFmt}</td>
            <td style="${displayStyle}; color: var(--danger); font-weight:bold;">${thanhTienFmt}</td>
            <td>${item.ghi_chu || ""}</td>
            <td><button onclick="removeFromCart(${index})" class="danger btn-sm">X</button></td>
        `;
    tbody.appendChild(tr);
  });
}

function removeFromCart(index) {
  cart.splice(index, 1);
  updateCartTable();
}

async function submitTransaction() {
  if (cart.length === 0) return alert("Giỏ hàng đang trống!");

  showLoadingSpinner();
  try {
    // 1. Lấy ngày hôm nay theo chuẩn YYYY-MM-DD để so sánh
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const dd = String(today.getDate()).padStart(2, "0");
    const todayStr = `${yyyy}-${mm}-${dd}`;

    const cleanTransactions = cart.map((c) => {
      // Nếu là ngày lùi thì gửi lên Server, nếu trùng ngày hôm nay thì gửi rỗng ("") để Server lấy giờ thực tế
      let isBackdated = c.tx_date && c.tx_date !== todayStr;
      return {
        ma_vt: c.ma_vt,
        ten_vt: c.ten_vt,
        loai_gd: c.loai_gd,
        so_luong: c.so_luong,
        ncc: c.ncc,
        ma_sp: c.ma_sp,
        so_chung_tu: c.so_chung_tu,
        don_gia: c.don_gia,
        ghi_chu: c.ghi_chu,
        tx_date: isBackdated ? c.tx_date : "", // <--- Xử lý ở đây
      };
    });

    const res = await fetch(`${API_URL}/api/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: user.ma_nv,
        bo_phan: user.bo_phan,
        transactions: cleanTransactions,
      }),
    });

    if (res.ok) {
      const isPending = user.bo_phan === "XUONG";

      // 2. Cập nhật tồn kho cục bộ ngay lập tức
      cart.forEach((c) => {
        const item = inventoryData.find((i) => i.ma_hang === c.ma_vt);
        if (!item) return;

        if (isPending) {
          if (c.loai_gd === "Xưởng mượn")
            item.sl_ton_moi = (item.sl_ton_moi || 0) - c.so_luong;
          else if (c.loai_gd === "Xưởng trả")
            item.sl_dang_muon = (item.sl_dang_muon || 0) - c.so_luong;
        } else {
          if (c.loai_gd === "Nhập mới")
            item.sl_ton_moi = (item.sl_ton_moi || 0) + c.so_luong;
          else if (c.loai_gd === "Xưởng mượn") {
            item.sl_dang_muon = (item.sl_dang_muon || 0) + c.so_luong;
            item.sl_ton_moi = (item.sl_ton_moi || 0) - c.so_luong;
          } else if (c.loai_gd === "Xưởng trả") {
            item.sl_dang_muon = (item.sl_dang_muon || 0) - c.so_luong;
            item.sl_ton_cu = (item.sl_ton_cu || 0) + c.so_luong;
          } else if (c.loai_gd === "Xuất GC") {
            item.sl_ton_cu = (item.sl_ton_cu || 0) - c.so_luong;
            item.sl_dang_gc = (item.sl_dang_gc || 0) + c.so_luong;
          } else if (c.loai_gd === "Nhập GC") {
            item.sl_dang_gc = (item.sl_dang_gc || 0) - c.so_luong;
            item.sl_ton_moi = (item.sl_ton_moi || 0) + c.so_luong;
          } else if (c.loai_gd === "Xuất thanh lý") {
            item.sl_ton_cu = (item.sl_ton_cu || 0) - c.so_luong;
            item.sl_thanh_ly = (item.sl_thanh_ly || 0) + c.so_luong;
          }
        }
      });
      renderInventoryTable(inventoryData);

      // 3. ÉP BẢNG LỊCH SỬ HIỆN NGAY LẬP TỨC (OPTIMISTIC UI) FIX LỖI GIỜ
      // Format giống hệt DB để không bị lệch
      const nowStr = `${yyyy}-${mm}-${dd} ${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}:${String(today.getSeconds()).padStart(2, "0")}`;

      cart.forEach((c) => {
        let isBackdated = c.tx_date && c.tx_date !== todayStr;
        let fakeTime = isBackdated ? `${c.tx_date} 08:00:00` : nowStr; // Hiển thị đúng thời gian trên web

        allTransactions.unshift({
          id: Date.now() + Math.random(),
          ma_nv: user.ma_nv,
          nguoi_giao_dich: user.ma_nv,
          ma_hang: c.ma_vt,
          ten_hang: c.ten_vt,
          loai_giao_dich: c.loai_gd,
          so_luong: c.so_luong,
          ma_sp_sx: c.ma_sp,
          ten_sp: c.ten_sp,
          so_chung_tu: c.so_chung_tu,
          don_gia: c.don_gia,
          thanh_tien: c.thanh_tien,
          ghi_chu: c.ghi_chu,
          trang_thai: isPending ? "pending" : "approved",
          thoi_gian_gd: fakeTime, // Ép giao diện hiển thị giờ lùi
          created_at: fakeTime,
        });
      });
      renderHistoryTable(allTransactions);

      showToast("Xác nhận phiếu thành công!");
      cart = [];
      updateCartTable();

      // ---> THÊM 2 DÒNG NÀY ĐỂ RESET NGÀY VỀ HÔM NAY <---
      const txDateEl = document.getElementById("txDate");
      if (txDateEl) txDateEl.valueAsDate = new Date();

      setTimeout(() => {
        loadInitialData(true);
      }, 2000);
    } else {
      showToast("Lỗi khi ghi nhận phiếu!", "error");
    }
  } catch (e) {
    showToast("Lỗi kết nối máy chủ!", "error");
  } finally {
    hideLoadingSpinner();
  }
}

// ==========================================
// 6. THÊM VẬT TƯ & NHÀ CUNG CẤP VÀO DB
// ==========================================
async function addItem() {
  const ma_hang = document.getElementById("vtMa").value.trim().toUpperCase();
  const phan_loai = document.getElementById("vtPhanLoai").value; // Lấy giá trị Phân loại
  const ten_hang = document.getElementById("vtTen").value.trim();
  const quy_cach = document.getElementById("vtQuyCach").value.trim();
  const noi_san_xuat = document.getElementById("vtNoiSX").value.trim();
  const don_vi_tinh = document.getElementById("vtDVT").value;

  if (!ma_hang || !ten_hang) return alert("Vui lòng nhập Mã và Tên dụng cụ!");

  try {
    // Đẩy phan_loai vào payload
    const payload = {
      ma_hang,
      phan_loai,
      ten_hang,
      quy_cach,
      noi_san_xuat,
      don_vi_tinh,
    };
    const res = await fetch(`${API_URL}/api/item/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      alert("Thêm dụng cụ thành công!");
      // Reset form
      document.getElementById("vtTen").value = "";
      document.getElementById("vtQuyCach").value = "";
      document.getElementById("vtNoiSX").value = "";
      document.getElementById("vtDVT").value = "Cái";
      document.getElementById("vtPhanLoai").value = "Khác"; // Reset phân loại

      await loadInitialData();
      generateDungCuId();
    } else {
      alert("Lỗi! Mã dụng cụ này đã tồn tại.");
    }
  } catch (e) {
    alert("Lỗi kết nối máy chủ!");
  }
}

async function addSupplier() {
  const ma_ncc = document.getElementById("nccMa").value.trim().toUpperCase();
  const ten_ncc = document.getElementById("nccTen").value.trim();
  const dia_chi = document.getElementById("nccDiaChi").value.trim();
  const sdt = document.getElementById("nccSDT").value.trim();
  const nguoi_lien_he = document.getElementById("nccLienHe").value.trim();
  const email = document.getElementById("nccEmail").value.trim();
  const ghi_chu = document.getElementById("nccGhiChu").value.trim();

  if (!ma_ncc || !ten_ncc) return alert("Vui lòng nhập Mã và Tên NCC!");

  try {
    const payload = {
      ma_ncc,
      ten_ncc,
      dia_chi,
      sdt,
      so_dt: sdt,
      nguoi_lien_he,
      email,
      ghi_chu,
    };
    const res = await fetch(`${API_URL}/api/ncc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      alert("Thêm Nhà Cung Cấp thành công!");
      document.getElementById("nccTen").value = "";
      document.getElementById("nccDiaChi").value = "";
      document.getElementById("nccSDT").value = "";
      document.getElementById("nccLienHe").value = "";
      document.getElementById("nccEmail").value = "";
      document.getElementById("nccGhiChu").value = "";

      await loadInitialData();
      generateNccId();
    } else {
      alert("Lỗi! Mã NCC này đã tồn tại.");
    }
  } catch (e) {
    alert("Lỗi kết nối máy chủ!");
  }
}

// ==========================================
// HÀM HIỂN THỊ CHI TIẾT VẬT TƯ & NHÀ CUNG CẤP
// ==========================================
function showItemDetail(ma_hang) {
  const item = inventoryData.find((i) => i.ma_hang === ma_hang);
  if (!item) return;

  let nccInfo = "-";
  if (item.ma_ncc) {
    const nccObj = nccData.find((n) => n.ma_ncc === item.ma_ncc);
    nccInfo = nccObj ? `${item.ma_ncc} - ${nccObj.ten_ncc}` : item.ma_ncc;
  }

  const modalBody = document.getElementById("modalBody");
  if (modalBody) {
    modalBody.innerHTML = `
            <p><strong>Mã dụng cụ:</strong> ${item.ma_hang || "-"}</p>
            <p><strong>Phân loại:</strong> ${item.phan_loai || "-"}</span></p>
            <p><strong>Tên dụng cụ:</strong> ${item.ten_hang || "-"}</p>
            <p><strong>Quy cách:</strong> ${item.quy_cach || "-"}</p>
            <p><strong>Nơi sản xuất:</strong> ${item.noi_san_xuat || "-"}</p>
            <p><strong>Đơn vị tính:</strong> ${item.don_vi_tinh || "-"}</p>
            <p><strong>Nhà cung cấp:</strong> <span style="color: var(--primary); font-weight: 500;">${nccInfo}</span></p>
        `;
  }
  const modalTitle = document.getElementById("modalTitle");
  if (modalTitle) modalTitle.innerText = "Chi Tiết Dụng Cụ";

  const modal = document.getElementById("itemDetailModal");
  if (modal) modal.classList.remove("hidden");
}

function showNccDetail(ma_ncc) {
  const ncc = nccData.find((n) => n.ma_ncc === ma_ncc);
  if (!ncc) return;

  const modalBody = document.getElementById("modalBody");
  if (modalBody) {
    modalBody.innerHTML = `
            <p><strong>Mã NCC:</strong> ${ncc.ma_ncc || "-"}</p>
            <p><strong>Tên NCC:</strong> ${ncc.ten_ncc || "-"}</p>
            <p><strong>Người liên hệ:</strong> ${ncc.nguoi_lien_he || "-"}</p>
            <p><strong>Số điện thoại:</strong> ${ncc.sdt || ncc.so_dt || "-"}</p>
            <p><strong>Email:</strong> ${ncc.email || "-"}</p>
            <p><strong>Địa chỉ:</strong> ${ncc.dia_chi || "-"}</p>
            <p><strong>Ghi chú:</strong> ${ncc.ghi_chu || "-"}</p>
        `;
  }
  const modalTitle = document.getElementById("modalTitle");
  if (modalTitle) modalTitle.innerText = "Chi Tiết Nhà Cung Cấp";

  const modal = document.getElementById("itemDetailModal");
  if (modal) modal.classList.remove("hidden");
}

// ==========================================
// 7. BỘ LỌC LỊCH SỬ GIAO DỊCH
// ==========================================
function applyHistoryFilter() {
  const fFrom = document.getElementById("filterFrom").value;
  const fTo = document.getElementById("filterTo").value;
  const fType = document.getElementById("filterType").value.toLowerCase();
  const fText = document.getElementById("filterText").value.toLowerCase();

  let filtered = allTransactions.filter((tx) => {
    let l_gd = (tx.loai_giao_dich || tx.loai_gd || "").toLowerCase();
    let l_mh = (tx.ten_hang || tx.ma_hang || "").toLowerCase();
    let time = new Date(tx.thoi_gian_gd || tx.created_at);

    if (fFrom && time < new Date(fFrom + "T00:00:00")) return false;
    if (fTo && time > new Date(fTo + "T23:59:59")) return false;
    if (fType && !l_gd.includes(fType)) return false;
    if (fText && !l_mh.includes(fText)) return false;

    return true;
  });
  renderHistoryTable(filtered);
}

function clearHistoryFilter() {
  document.getElementById("filterFrom").value = "";
  document.getElementById("filterTo").value = "";
  document.getElementById("filterType").value = "";
  document.getElementById("filterText").value = "";
  renderHistoryTable(allTransactions);
}

function filterInventory() {
  const plInput = document
    .getElementById("searchPhanLoai")
    .value.toLowerCase()
    .trim();
  const textInput = document
    .getElementById("searchTenHang")
    .value.toLowerCase()
    .trim();

  // 1. Lọc dữ liệu cho Bảng (Dựa vào cả Phân loại + Tên/Mã)
  const filteredData = inventoryData.filter((item) => {
    const ma = (item.ma_hang || "").toLowerCase();
    const ten = (item.ten_hang || "").toLowerCase();
    const phanLoai = (item.phan_loai || "").toLowerCase();

    // Nếu để trống hoặc gõ "tất cả" thì cho qua (match = true)
    const plMatch =
      plInput === "" || plInput === "tất cả" || phanLoai.includes(plInput);
    const textMatch =
      textInput === "" || ma.includes(textInput) || ten.includes(textInput);

    return plMatch && textMatch;
  });

  const limit = plInput === "" && textInput === "" ? 50 : 0;
  renderInventoryTable(filteredData, limit);

  // 2. LOGIC MỚI: Cập nhật gợi ý xổ xuống cho ô Tên Hàng
  // Dùng filter riêng biệt chỉ check Phân loại (để không bị mất danh sách khi đang gõ tên)
  const dataForSuggestion = inventoryData.filter((item) => {
    const phanLoai = (item.phan_loai || "").toLowerCase();
    return plInput === "" || plInput === "tất cả" || phanLoai.includes(plInput);
  });

  const dataList = document.getElementById("searchTenHangList");
  if (dataList) {
    // Tối ưu DOM: Gom toàn bộ thẻ <option> thành chuỗi rồi đổ 1 lần
    let htmlOptions = dataForSuggestion
      .map((i) => `<option value="${i.ten_hang}"></option>`)
      .join("");

    dataList.innerHTML = htmlOptions;
  }
}
// XUẤT FILE EXCEL TỒN KHO
function exportExcel() {
  const input = document.getElementById("searchInput").value.toLowerCase();
  const dataToExport = inventoryData
    .filter((item) => {
      const text =
        `${item.ma_hang} ${item.ten_hang} ${item.don_vi_tinh}`.toLowerCase();
      return text.includes(input);
    })
    .map((item) => ({
      "Mã Dụng Cụ": item.ma_hang || "",
      "Tên Dụng Cụ": item.ten_hang || "",
      ĐVT: item.don_vi_tinh || "",
      "Kho DC Mới": item.sl_ton_moi || 0,
      "Xưởng Đang Giữ": item.sl_dang_muon || 0,
      "Kho DC Cũ": item.sl_ton_cu || 0,
      "Đang Đi GC": item.sl_dang_gc || 0,
      "Thanh Lý": item.sl_thanh_ly || 0,
    }));

  if (dataToExport.length === 0) return alert("Không có dữ liệu để xuất!");
  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Ton_Kho");
  const now = new Date();
  const dateStr = `${now.getDate()}_${now.getMonth() + 1}_${now.getFullYear()}`;
  XLSX.writeFile(workbook, `Bao_Cao_Ton_Kho_${dateStr}.xlsx`);
}
// XUẤT FILE EXCEL LỊCH SỬ GIAO DỊCH
function exportHistoryExcel() {
  const fFrom = document.getElementById("filterFrom").value;
  const fTo = document.getElementById("filterTo").value;
  const fType = document.getElementById("filterType").value.toLowerCase();
  const fText = document.getElementById("filterText").value.toLowerCase();

  // 1. Lọc lại data theo điều kiện hiện tại
  let filtered = allTransactions.filter((tx) => {
    let l_gd = (tx.loai_giao_dich || tx.loai_gd || "").toLowerCase();
    let l_mh = (tx.ten_hang || tx.ma_hang || "").toLowerCase();
    let time = new Date(tx.thoi_gian_gd || tx.created_at);

    if (fFrom && time < new Date(fFrom + "T00:00:00")) return false;
    if (fTo && time > new Date(fTo + "T23:59:59")) return false;
    if (fType && !l_gd.includes(fType)) return false;
    if (fText && !l_mh.includes(fText)) return false;

    return true;
  });

  if (filtered.length === 0) return alert("Không có dữ liệu để xuất!");

  // 2. Định dạng lại các cột cho file Excel đẹp và dễ đọc
  const dataToExport = filtered.map((tx) => {
    let l_chung_tu = tx.so_chung_tu || "-";
    let l_hd = l_chung_tu;
    let l_po = "-";
    if (l_chung_tu.includes("(PO:")) {
      let parts = l_chung_tu.split("(PO:");
      l_hd = parts[0].trim() || "-";
      l_po = parts[1].replace(")", "").trim();
    } else if (l_chung_tu.startsWith("PO:")) {
      l_hd = "-";
      l_po = l_chung_tu.replace("PO:", "").trim();
    }

    let statusText = "Hoàn tất";
    if (tx.trang_thai === "pending") statusText = "Chờ duyệt";
    if (tx.trang_thai === "approved") statusText = "Đã duyệt";
    if (tx.trang_thai === "rejected") statusText = "Từ chối";

    return {
      "Thời Gian": formatShortDate(tx.thoi_gian_gd || tx.created_at),
      "Người Giao Dịch": tx.nguoi_giao_dich || tx.ma_nv,
      "Tên Dụng Cụ": tx.ten_hang || tx.ma_hang,
      "Loại Giao Dịch": tx.loai_giao_dich || tx.loai_gd,
      "Số Lượng": tx.so_luong,
      "Dùng Cho SP": tx.ten_sp_sx || tx.ten_sp || "-",
      "Số Hóa Đơn": l_hd,
      "Số PO": l_po,
      "Đơn Giá": tx.don_gia || 0,
      "Thành Tiền": tx.thanh_tien || (tx.don_gia || 0) * (tx.so_luong || 0),
      "Trạng Thái": statusText,
      "Ghi Chú": tx.ghi_chu || "",
    };
  });

  // 3. Tiến hành tải file
  const worksheet = XLSX.utils.json_to_sheet(dataToExport);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Lich_Su_GD");

  const now = new Date();
  const dateStr = `${now.getDate()}_${now.getMonth() + 1}_${now.getFullYear()}`;
  XLSX.writeFile(workbook, `Bao_Cao_Giao_Dich_${dateStr}.xlsx`);
}

// BỘ LỌC NHÀ CUNG CẤP
function filterSupplier() {
  const search = document
    .getElementById("searchNcc")
    .value.toLowerCase()
    .trim();
  const filteredData = nccData.filter((ncc) => {
    const ma = (ncc.ma_ncc || "").toLowerCase();
    const ten = (ncc.ten_ncc || "").toLowerCase();
    return ma.includes(search) || ten.includes(search);
  });

  // Tái sử dụng hàm renderSupplierTable đã có sẵn
  renderSupplierTable(filteredData);
}

// ==========================================
// HỆ THỐNG TỰ ĐỘNG SINH MÃ (AUTO-GENERATE ID)
// ==========================================
function getAutoNextId(prefix, dataArray, idKey) {
  if (!dataArray || dataArray.length === 0) return prefix + "001";
  let maxNum = 0;
  dataArray.forEach((item) => {
    let currentId = item[idKey];
    if (currentId && currentId.startsWith(prefix)) {
      let numPart = parseInt(currentId.replace(prefix, ""), 10);
      if (!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
    }
  });
  let nextNum = maxNum + 1;
  return prefix + String(nextNum).padStart(3, "0");
}

window.generateDungCuId = function () {
  const inputElement = document.getElementById("vtMa");
  if (inputElement)
    inputElement.value = getAutoNextId("DC", inventoryData, "ma_hang");
};

window.generateNccId = function () {
  const inputElement = document.getElementById("nccMa");
  if (inputElement)
    inputElement.value = getAutoNextId("NCC", nccData, "ma_ncc");
};

// ==========================================
// 8. CHỨC NĂNG SỬA - XÓA VẬT TƯ & NCC
// ==========================================
function openEditItem(ma_hang, event) {
  event.stopPropagation();
  const item = inventoryData.find((i) => i.ma_hang === ma_hang);
  if (!item) return;

  document.getElementById("editItemMa").value = item.ma_hang || "";
  document.getElementById("editItemTen").value = item.ten_hang || "";
  document.getElementById("editItemQc").value = item.quy_cach || "";
  document.getElementById("editItemNsx").value = item.noi_san_xuat || "";
  document.getElementById("editItemDvt").value = item.don_vi_tinh || "";
  document.getElementById("editItemNcc").value = item.ma_ncc || "";

  document.getElementById("editItemModal").classList.remove("hidden");
}

async function submitEditItem() {
  const payload = {
    ma_hang: document.getElementById("editItemMa").value,
    phan_loai: document.getElementById("editItemPhanLoai").value,
    ten_hang: document.getElementById("editItemTen").value,
    quy_cach: document.getElementById("editItemQc").value,
    noi_san_xuat: document.getElementById("editItemNsx").value,
    don_vi_tinh: document.getElementById("editItemDvt").value,
    ma_ncc: document.getElementById("editItemNcc").value,
  };
  try {
    const res = await fetch(`${API_URL}/api/item/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      alert("Đã cập nhật dụng cụ!");
      document.getElementById("editItemModal").classList.add("hidden");
      loadInitialData();
    } else alert("Lỗi cập nhật!");
  } catch (e) {
    alert("Lỗi mạng!");
  }
}

async function deleteItem(ma_hang, event) {
  event.stopPropagation();
  if (!confirm(`Xác nhận xóa Dụng cụ mã [${ma_hang}]?`)) return;
  try {
    const res = await fetch(`${API_URL}/api/item/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ma_hang }),
    });
    if (res.ok) {
      alert("Đã xóa!");
      loadInitialData();
    } else alert("Lỗi xóa!");
  } catch (e) {
    alert("Lỗi mạng!");
  }
}

function openEditNcc(ma_ncc, event) {
  event.stopPropagation();
  const ncc = nccData.find((n) => n.ma_ncc === ma_ncc);
  if (!ncc) return;

  document.getElementById("editNccMa").value = ncc.ma_ncc;
  document.getElementById("editNccTen").value = ncc.ten_ncc;
  document.getElementById("editNccLh").value = ncc.nguoi_lien_he || "";
  document.getElementById("editNccSdt").value = ncc.so_dt || ncc.sdt || "";
  document.getElementById("editNccEmail").value = ncc.email || "";
  document.getElementById("editNccDc").value = ncc.dia_chi || "";
  document.getElementById("editNccGhiChu").value = ncc.ghi_chu || "";

  document.getElementById("editNccModal").classList.remove("hidden");
}

async function submitEditNcc() {
  const sdtForm = document.getElementById("editNccSdt").value;
  const payload = {
    ma_ncc: document.getElementById("editNccMa").value,
    ten_ncc: document.getElementById("editNccTen").value,
    nguoi_lien_he: document.getElementById("editNccLh").value,
    sdt: sdtForm,
    so_dt: sdtForm,
    email: document.getElementById("editNccEmail").value,
    dia_chi: document.getElementById("editNccDc").value,
    ghi_chu: document.getElementById("editNccGhiChu").value,
  };
  try {
    const res = await fetch(`${API_URL}/api/ncc/update`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      alert("Đã cập nhật NCC!");
      document.getElementById("editNccModal").classList.add("hidden");
      loadInitialData();
    } else alert("Lỗi cập nhật! (Do API trả về lỗi hoặc thiếu Data)");
  } catch (e) {
    alert("Lỗi mạng!");
  }
}

async function deleteNcc(ma_ncc, event) {
  event.stopPropagation();
  if (!confirm(`Xác nhận xóa Nhà cung cấp [${ma_ncc}]?`)) return;
  try {
    const res = await fetch(`${API_URL}/api/ncc/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ma_ncc }),
    });
    if (res.ok) {
      alert("Đã xóa!");
      loadInitialData();
    } else alert("Lỗi xóa!");
  } catch (e) {
    alert("Lỗi mạng!");
  }
}
// --- MODAL PHÊ DUYỆT VÀ CHỌN MÃ ---
function openApproveModal(id) {
  currentApproveTxId = id;
  const tx = allTransactions.find((t) => t.id === id);
  if (!tx) return;

  // Hiển thị nội dung Xưởng gửi để Văn phòng dịch
  document.getElementById("approveModalDesc").innerHTML = `
    <strong>Giao dịch:</strong> ${tx.loai_giao_dich} | <strong>SL:</strong> <span style="color:var(--danger)">${tx.so_luong}</span><br>
    <strong>Tên xưởng gọi:</strong> <b style="color:var(--primary); font-size: 16px;">${tx.ten_hang}</b>
  `;

  const plSelect = document.getElementById("approvePhanLoai");
  const itemInput = document.getElementById("approveItemSelect");
  const dataList = document.getElementById("approveDataItems");

  plSelect.value = "";
  itemInput.value = "";
  dataList.innerHTML = "";

  // Logic MỚI: Văn phòng gõ Loại -> Lọc ngay lập tức không bị treo máy
  plSelect.oninput = function () {
    const pl = this.value;
    itemInput.value = ""; // Reset ô chọn tên khi đổi phân loại

    // THÊM ĐIỀU KIỆN "Tất cả" VÀO ĐÂY:
    let filtered = inventoryData.filter(
      (i) => !pl || pl === "Tất cả" || i.phan_loai === pl,
    );

    // TỐI ƯU DOM: Gom toàn bộ thẻ <option> thành 1 chuỗi dài duy nhất
    let htmlOptions = filtered
      .map((i) => `<option value="${i.ma_hang} | ${i.ten_hang}"></option>`)
      .join("");

    // Đổ vào HTML đúng 1 lần (Tốc độ ánh sáng, không bao giờ đơ)
    dataList.innerHTML = htmlOptions;
  };

  document.getElementById("approveModal").classList.remove("hidden");
}

function closeApproveModal() {
  document.getElementById("approveModal").classList.add("hidden");
  currentApproveTxId = null;
}

// Hàm Duyệt Phiếu thay thế processApproval cũ
async function confirmApproval(action) {
  if (!currentApproveTxId) return;
  const actionName = action === "approve" ? "DUYỆT" : "TỪ CHỐI";

  let ma_hang_thuc_te = null;
  const itemInput = document.getElementById("approveItemSelect").value;

  if (action === "approve") {
    if (!itemInput)
      return alert(
        "Vui lòng chọn Tên Dụng Cụ Chính Xác từ danh sách để duyệt!",
      );

    // Tách lấy mã (VD: DC001 | Mũi Tap M10 -> Lấy DC001)
    ma_hang_thuc_te = itemInput.split(" | ")[0].trim();

    const itemDb = inventoryData.find((i) => i.ma_hang === ma_hang_thuc_te);
    if (!itemDb) return alert("Lỗi: Mã dụng cụ không tồn tại trong kho chuẩn!");
  }

  if (!confirm(`Bạn có chắc chắn muốn ${actionName} phiếu này không?`)) return;

  try {
    const res = await fetch(`${API_URL}/api/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: currentApproveTxId,
        action: action,
        ma_hang_thuc_te: ma_hang_thuc_te, // Đẩy mã thật lên Server
      }),
    });

    if (res.ok) {
      showToast(`Đã ${actionName} phiếu thành công!`);
      closeApproveModal();
      loadInitialData(true); // F5 ngầm lại bảng lịch sử và tồn kho ngay lập tức
    } else {
      showToast("Lỗi! Không thể xử lý phiếu lúc này.", "error");
    }
  } catch (e) {
    showToast("Lỗi kết nối máy chủ Cloudflare!", "error");
  }
}

function generateReport() {
  console.log("=== BẮT ĐẦU CHẠY BÁO CÁO ==="); // Đoạn này để dò lỗi

  const fromDate = document.getElementById("repFrom")
    ? document.getElementById("repFrom").value
    : "";
  const toDate = document.getElementById("repTo")
    ? document.getElementById("repTo").value
    : "";
  const search = document.getElementById("repSearch")
    ? document.getElementById("repSearch").value.toLowerCase().trim()
    : "";

  // Lấy an toàn giá trị lọc
  const filterElement = document.getElementById("repFilterType");
  const filterType = filterElement
    ? filterElement.value.toLowerCase().trim()
    : "";

  console.log("Loại giao dịch đang chọn:", filterType);

  const tbody = document.querySelector("#reportTable tbody");
  if (!tbody) return;

  let validTxs = allTransactions.filter((tx) => tx.trang_thai === "approved");

  if (fromDate) {
    validTxs = validTxs.filter(
      (tx) => (tx.thoi_gian_gd || tx.created_at).substring(0, 10) >= fromDate,
    );
  }
  if (toDate) {
    validTxs = validTxs.filter(
      (tx) => (tx.thoi_gian_gd || tx.created_at).substring(0, 10) <= toDate,
    );
  }

  // LOGIC LỌC SIÊU AN TOÀN: Ép tất cả về chữ thường và cắt khoảng trắng
  if (filterType !== "") {
    validTxs = validTxs.filter((tx) => {
      let loaiGD = (tx.loai_giao_dich || tx.loai_gd || "").toLowerCase().trim();
      return loaiGD === filterType || loaiGD.includes(filterType);
    });
  }

  console.log("Số lượng phiếu lọc được:", validTxs.length);

  let reportData = {};
  validTxs.forEach((tx) => {
    let ma = tx.ma_hang;
    if (!ma || ma === "CHO_MAP") return;

    if (!reportData[ma]) {
      const itemDb = inventoryData.find((i) => i.ma_hang === ma);
      reportData[ma] = {
        ten_hang: itemDb ? itemDb.ten_hang : tx.ten_chuan || tx.ten_hang,
        nhap_moi: 0,
        xuong_muon: 0,
        xuong_tra: 0,
        xuat_gc: 0,
        thanh_ly: 0,
        tong_tien: 0,
      };
    }

    let loai = (tx.loai_giao_dich || tx.loai_gd || "").toLowerCase().trim();
    let sl = parseInt(tx.so_luong) || 0;
    let tien = parseInt(tx.thanh_tien) || 0;

    if (loai === "nhập mới" || loai === "nhập dc mới") {
      reportData[ma].nhap_moi += sl;
      reportData[ma].tong_tien += tien;
    } else if (loai === "xưởng mượn") reportData[ma].xuong_muon += sl;
    else if (loai === "xưởng trả") reportData[ma].xuong_tra += sl;
    else if (loai === "xuất gc") reportData[ma].xuat_gc += sl;
    else if (loai === "nhập gc") reportData[ma].tong_tien += tien;
    else if (loai === "xuất thanh lý") reportData[ma].thanh_ly += sl;
  });

  let finalArray = Object.keys(reportData).map((ma) => ({
    ma_hang: ma,
    ...reportData[ma],
  }));

  if (search) {
    finalArray = finalArray.filter(
      (r) =>
        r.ma_hang.toLowerCase().includes(search) ||
        r.ten_hang.toLowerCase().includes(search),
    );
  }

  if (finalArray.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 20px;">Không có dữ liệu!</td></tr>`;
    return;
  }

  let htmlRows = [];
  let sumNhapMoi = 0,
    sumXuongMuon = 0,
    sumXuongTra = 0,
    sumXuatGC = 0,
    sumThanhLy = 0,
    sumTongTien = 0;

  finalArray.forEach((r) => {
    sumNhapMoi += r.nhap_moi;
    sumXuongMuon += r.xuong_muon;
    sumXuongTra += r.xuong_tra;
    sumXuatGC += r.xuat_gc;
    sumThanhLy += r.thanh_ly;
    sumTongTien += r.tong_tien;

    let tongTienFmt =
      r.tong_tien > 0 ? Number(r.tong_tien).toLocaleString("vi-VN") : "-";

    htmlRows.push(`
      <tr>
        <td style="font-weight: bold;">${r.ma_hang}</td>
        <td style="font-weight: 500; color: var(--primary);">${r.ten_hang}</td>
        <td style="font-weight: bold;">${r.nhap_moi > 0 ? r.nhap_moi : "-"}</td>
        <td style="font-weight: bold;">${r.xuong_muon > 0 ? r.xuong_muon : "-"}</td>
        <td style="font-weight: bold;">${r.xuong_tra > 0 ? r.xuong_tra : "-"}</td>
        <td style="font-weight: bold;">${r.xuat_gc > 0 ? r.xuat_gc : "-"}</td>        
        <td style="font-weight: bold;">${r.thanh_ly > 0 ? r.thanh_ly : "-"}</td>
        <td style="font-weight: bold; color: var(--danger);">${tongTienFmt}</td>
      </tr>
    `);
  });

  htmlRows.push(`
    <tr style="font-weight: bold; background-color: #e2e8f0;">
      <td colspan="2" style="text-align: right; color: #334155;">TỔNG TOÀN BỘ:</td>
      <td style="color: var(--success)">${sumNhapMoi > 0 ? sumNhapMoi : "-"}</td>
      <td style="color: var(--warning)">${sumXuongMuon > 0 ? sumXuongMuon : "-"}</td>
      <td style="color: #64748b">${sumXuongTra > 0 ? sumXuongTra : "-"}</td>
      <td style="color: var(--accent)">${sumXuatGC > 0 ? sumXuatGC : "-"}</td>
      <td style="color: var(--danger)">${sumThanhLy > 0 ? sumThanhLy : "-"}</td>
      <td style="color: #e11d48">${sumTongTien > 0 ? sumTongTien.toLocaleString("vi-VN") : "-"}</td>
    </tr>
  `);

  tbody.innerHTML = htmlRows.join("");
}

function exportReportExcel() {
  const table = document.getElementById("reportTable");
  // Sử dụng thư viện SheetJS để xuất file XLSX chuẩn xác, không bị lỗi font
  const workbook = XLSX.utils.table_to_book(table, {
    sheet: "Bao_Cao_Tong_Hop",
  });

  const now = new Date();
  const dateStr = `${now.getDate()}_${now.getMonth() + 1}_${now.getFullYear()}`;
  XLSX.writeFile(workbook, `Bao_Cao_Tong_Hop_${dateStr}.xlsx`);
}
