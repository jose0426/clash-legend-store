import { categoryNames } from "./products.js";
import { Cart } from "./cart.js";
import { supabaseConfig, paypalClientId } from "./config.js";

const productGrid = document.querySelector("#product-grid");
const searchInput = document.querySelector("#product-search");
const toast = document.querySelector(".toast");
const catalogStatus = document.querySelector("#catalog-status");
const paymentCheckout = document.querySelector("#payment-checkout");
const paymentStatus = document.querySelector("#payment-status");
const paypalButtonSlot = document.querySelector("#paypal-button-slot");
let activeFilter = "all";
let toastTimer;
let products = [];
let supabase;
let paypalSdkPromise;
let activePaymentButton;

const money = amount => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const isHttpsUrl = value => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

function mapProduct(row) {
  return {
    id: row.id, name: row.name, townHall: row.town_hall,
    category: row.category,
    categoryLabel: row.category === "free" ? "Base gratuita" : categoryNames[row.category] || "Premium",
    type: row.is_free ? "free" : "premium", description: row.description,
    price: Number(row.price), imageUrl: row.image_url, badge: row.is_free ? "Gratis" : "Premium",
    bases: row.bundle_count || 0, link: row.design_link
  };
}

function renderProducts() {
  const query = searchInput.value.trim().toLocaleLowerCase("es");
  const shown = products.filter(product => {
    const matchesFilter = activeFilter === "all" || product.category === activeFilter ||
      (activeFilter === "premium" && product.type === "premium");
    const haystack = `${product.name} ${product.townHall} ${product.categoryLabel} ${product.description}`.toLocaleLowerCase("es");
    return matchesFilter && haystack.includes(query);
  });

  if (!shown.length) {
    const loading = catalogStatus.dataset.state === "loading";
    const failed = catalogStatus.dataset.state === "error";
    productGrid.innerHTML = `<div class="no-results"><i class="fa-solid ${loading ? "fa-spinner" : failed ? "fa-triangle-exclamation" : "fa-map"}" aria-hidden="true"></i><h3>${loading ? "Cargando catálogo" : failed ? "Falta activar el catálogo" : "Todavía no hay bases publicadas"}</h3><p>${loading ? "Espera un momento." : failed ? "Abre admin.html y sigue los pasos de configuración para crear las tablas de la tienda." : "Vuelve pronto para ver los diseños disponibles."}</p></div>`;
    return;
  }

  productGrid.innerHTML = shown.map(product => `
    <article class="product-card">
      <div class="product-art ${product.imageUrl && isHttpsUrl(product.imageUrl) ? "has-product-image" : ""}">
        ${product.imageUrl && isHttpsUrl(product.imageUrl) ? `<img class="product-image" src="${escapeHtml(product.imageUrl)}" alt="Vista previa de ${escapeHtml(product.name)}" loading="lazy">` : ""}
        <div class="art-grid"></div><span class="townhall-badge">${escapeHtml(product.townHall)}</span>
        <span class="product-badge ${product.type === "free" ? "badge-free" : "badge-premium"}">${product.badge}</span>
        <div class="mini-village"><span class="mini-wall wall-one"></span><span class="mini-wall wall-two"></span><i class="fa-solid ${product.category === "war" ? "fa-crosshairs" : product.category === "bundle" ? "fa-gem" : "fa-chess-rook"}" aria-hidden="true"></i><span class="mini-tower tower-left"></span><span class="mini-tower tower-right"></span></div>
        <span class="art-caption"><i class="fa-solid fa-map" aria-hidden="true"></i> ${product.type === "free" ? "BASE GRATUITA" : "DISEÑO PREMIUM"}</span>
      </div>
      <div class="product-info">
        <div class="product-category">${escapeHtml(product.categoryLabel)}</div>
        <h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p>
        ${product.bases ? `<div class="bundle-detail"><i class="fa-solid fa-layer-group" aria-hidden="true"></i> ${product.bases} bases incluidas</div>` : ""}
        <div class="product-bottom"><strong class="product-price">${product.price === 0 ? "Gratis" : money(product.price)}${product.price > 0 ? '<small> USD</small>' : ""}</strong>
          ${product.type === "free"
            ? `<button class="button button-small button-muted" type="button" data-action="link" data-id="${escapeHtml(product.id)}" ${product.link && isHttpsUrl(product.link) ? "" : "disabled"}>${product.link && isHttpsUrl(product.link) ? "Abrir base gratis" : "Enlace pendiente"}</button>`
            : `<button class="button button-small button-primary" type="button" data-action="add" data-id="${escapeHtml(product.id)}"><i class="fa-solid fa-plus" aria-hidden="true"></i> Agregar al carrito</button>`}
        </div>
      </div>
    </article>`).join("");
}

async function loadProducts() {
  catalogStatus.dataset.state = "loading";
  renderProducts();
  if (supabaseConfig.url === "SUPABASE_URL" || supabaseConfig.anonKey === "SUPABASE_ANON_KEY") {
    catalogStatus.textContent = "Configura Supabase para cargar el catálogo publicado.";
    catalogStatus.hidden = false;
    catalogStatus.dataset.state = "ready";
    renderProducts();
    return;
  }
  try {
    const { data, error } = await supabase.from("products").select("*").eq("is_published", true).order("created_at", { ascending: false });
    if (error) throw error;
    products = data.map(mapProduct);
    catalogStatus.hidden = products.length > 0;
    catalogStatus.textContent = products.length ? "" : "Aún no hay bases publicadas.";
    catalogStatus.dataset.state = "ready";
    renderProducts();
  } catch (error) {
    console.error("No se pudo cargar el catálogo de Supabase.", error);
    catalogStatus.textContent = "Supabase está conectado, pero faltan las tablas del catálogo. Ejecuta supabase/setup.sql en SQL Editor.";
    catalogStatus.hidden = false;
    catalogStatus.dataset.state = "error";
    renderProducts();
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 4300);
}

function renderCart(cart) {
  document.querySelectorAll(".cart-count").forEach(node => { node.textContent = cart.count; });
  document.querySelector(".cart-count-inline").textContent = cart.count;
  document.querySelector(".cart-subtotal").textContent = money(cart.total);
  document.querySelector(".cart-total").innerHTML = `${money(cart.total)} <small>USD</small>`;
  const itemsContainer = document.querySelector(".cart-items");
  document.querySelector(".cart-empty").hidden = cart.items.length > 0;
  document.querySelector(".cart-summary").hidden = cart.items.length === 0;
  itemsContainer.innerHTML = cart.items.map(item => `
    <article class="cart-item">
      <div class="cart-item-art"><i class="fa-solid fa-chess-rook" aria-hidden="true"></i></div>
      <div class="cart-item-details"><h3>${escapeHtml(item.name)}</h3><span>${escapeHtml(item.townHall)}</span><strong>${money(item.price * item.quantity)}</strong>
        <div class="quantity-control"><button type="button" data-cart-action="decrease" data-id="${escapeHtml(item.id)}" aria-label="Disminuir cantidad de ${escapeHtml(item.name)}">−</button><span>${item.quantity}</span><button type="button" data-cart-action="increase" data-id="${escapeHtml(item.id)}" aria-label="Aumentar cantidad de ${escapeHtml(item.name)}">+</button></div>
      </div>
      <button class="remove-item" type="button" data-cart-action="remove" data-id="${escapeHtml(item.id)}" aria-label="Eliminar ${escapeHtml(item.name)}"><i class="fa-regular fa-trash-can" aria-hidden="true"></i></button>
    </article>`).join("");
}

const cart = new Cart(renderCart);

function openCart() {
  document.querySelector(".cart-drawer").classList.add("open");
  document.querySelector(".cart-drawer").setAttribute("aria-hidden", "false");
  document.querySelector(".drawer-backdrop").hidden = false;
  document.body.classList.add("drawer-open");
  document.querySelector(".drawer-close").focus();
}

function closeCart() {
  paymentCheckout.hidden = true;
  paypalButtonSlot.replaceChildren();
  document.querySelector(".cart-drawer").classList.remove("open");
  document.querySelector(".cart-drawer").setAttribute("aria-hidden", "true");
  document.querySelector(".drawer-backdrop").hidden = true;
  document.body.classList.remove("drawer-open");
}

productGrid.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const product = products.find(entry => entry.id === button.dataset.id);
  if (!product) return;
  if (button.dataset.action === "add") {
    cart.add({ ...product, image: "" });
    showToast(`${product.name} se agregó al carrito.`);
  } else if (button.dataset.action === "link" && product.link && isHttpsUrl(product.link)) {
    window.open(product.link, "_blank", "noopener,noreferrer");
  }
});

document.querySelector(".cart-items").addEventListener("click", event => {
  const button = event.target.closest("button[data-cart-action]");
  if (!button) return;
  const { id, cartAction } = button.dataset;
  if (cartAction === "increase") cart.update(id, 1);
  if (cartAction === "decrease") cart.update(id, -1);
  if (cartAction === "remove") cart.remove(id);
});

document.querySelectorAll(".filter-chip").forEach(button => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    document.querySelectorAll(".filter-chip").forEach(chip => chip.classList.toggle("active", chip === button));
    renderProducts();
  });
});

document.querySelectorAll("[data-category]").forEach(button => {
  button.addEventListener("click", () => {
    activeFilter = button.dataset.category;
    document.querySelectorAll(".filter-chip").forEach(chip => chip.classList.toggle("active", chip.dataset.filter === activeFilter));
    renderProducts();
    document.querySelector("#productos").scrollIntoView({ behavior: "smooth" });
  });
});

document.querySelectorAll("[data-filter-link]").forEach(link => {
  link.addEventListener("click", () => {
    activeFilter = link.dataset.filterLink;
    document.querySelectorAll(".filter-chip").forEach(chip => chip.classList.toggle("active", chip.dataset.filter === activeFilter));
    renderProducts();
  });
});

searchInput.addEventListener("input", renderProducts);
document.querySelector(".cart-trigger").addEventListener("click", openCart);
document.querySelector(".drawer-close").addEventListener("click", closeCart);
document.querySelector(".drawer-backdrop").addEventListener("click", closeCart);
document.querySelector(".continue-shopping").addEventListener("click", closeCart);
document.querySelector(".checkout-button").addEventListener("click", async () => {
  if (!cart.items.length) return;
  paymentCheckout.hidden = false;
  paymentStatus.textContent = "";
  paymentStatus.classList.remove("payment-error", "payment-success");
  paymentCheckout.scrollIntoView({ behavior: "smooth", block: "nearest" });
  await renderPayPalButton(document.querySelector('input[name="payment-method"]:checked').value);
});
document.querySelectorAll('input[name="payment-method"]').forEach(input => {
  input.addEventListener("change", () => renderPayPalButton(input.value));
});

async function loadPayPalSdk() {
  if (!paypalClientId) {
    throw new Error("El pago en línea aún no está disponible. No se realizó ningún cobro.");
  }
  if (window.paypal) return window.paypal;
  if (!paypalSdkPromise) {
    paypalSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const sdkUrl = new URL("https://www.paypal.com/sdk/js");
      sdkUrl.searchParams.set("client-id", paypalClientId);
      sdkUrl.searchParams.set("currency", "USD");
      sdkUrl.searchParams.set("intent", "capture");
      sdkUrl.searchParams.set("components", "buttons");
      sdkUrl.searchParams.set("enable-funding", "card");
      script.src = sdkUrl.toString();
      script.async = true;
      script.onload = () => window.paypal ? resolve(window.paypal) : reject(new Error("PayPal no cargó el checkout."));
      script.onerror = () => reject(new Error("No se pudo cargar PayPal. Comprueba la conexión y el Client ID."));
      document.head.append(script);
    });
  }
  return paypalSdkPromise;
}

async function requestPaymentFunction(name, payload) {
  let response;
  try {
    response = await fetch(`${supabaseConfig.url}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: supabaseConfig.anonKey },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(`No se pudo conectar con la función ${name}.`, error);
    throw new Error("El servidor de pagos de Supabase no está disponible o aún no está desplegado. No se realizó ni confirmó ningún cobro.");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || "El servidor de pagos no pudo procesar la solicitud. No se confirmó ningún cobro.");
  }
  return result;
}

async function renderPayPalButton(method) {
  if (!cart.items.length) return;
  activePaymentButton = method;
  paypalButtonSlot.replaceChildren();
  paymentStatus.textContent = "";
  paymentStatus.classList.remove("payment-error", "payment-success");
  const loading = document.createElement("p");
  loading.className = "payment-status";
  loading.textContent = "Cargando pago seguro…";
  paypalButtonSlot.append(loading);
  try {
    const paypal = await loadPayPalSdk();
    if (activePaymentButton !== method || paymentCheckout.hidden) return;
    paypalButtonSlot.replaceChildren();
    const fundingSource = method === "card" ? paypal.FUNDING.CARD : paypal.FUNDING.PAYPAL;
    await paypal.Buttons({
      fundingSource,
      style: { layout: "vertical", label: method === "card" ? "pay" : "paypal", shape: "rect", height: 44 },
      createOrder: async () => {
        const result = await requestPaymentFunction("paypal-create-order", {
          items: cart.items.map(item => ({ id: item.id, quantity: item.quantity }))
        });
        if (typeof result.orderId !== "string") {
          throw new Error(result.error || "No se pudo iniciar el pago.");
        }
        return result.orderId;
      },
      onApprove: async data => {
        paymentStatus.textContent = "Verificando el pago con PayPal…";
        const result = await requestPaymentFunction("paypal-capture-order", { orderId: data.orderID });
        if (result.status !== "COMPLETED" || !Array.isArray(result.items)) {
          throw new Error(result.error || "PayPal no confirmó el pago. No cierres la página; puedes volver a intentarlo.");
        }
        cart.removePurchased(result.items);
        document.querySelector(".cart-empty").hidden = true;
        paymentStatus.classList.add("payment-success");
        paymentStatus.textContent = `Pago confirmado. Guarda el número de pedido ${result.orderId}; la entrega del diseño se coordina manualmente con la tienda.`;
        showToast("Pago confirmado por PayPal.");
      },
      onError: error => {
        console.error("PayPal no pudo completar el checkout.", error);
        paymentStatus.classList.add("payment-error");
        paymentStatus.textContent = error?.message || "Ocurrió un error al procesar el pago. Inténtalo de nuevo.";
      },
      onCancel: () => {
        paymentStatus.textContent = "Pago cancelado. No se realizó ningún cobro.";
      }
    }).render(paypalButtonSlot);
  } catch (error) {
    console.error("No se pudo preparar el checkout de PayPal.", error);
    paypalButtonSlot.replaceChildren();
    paymentStatus.classList.add("payment-error");
    paymentStatus.textContent = error.message;
  }
}
document.querySelector(".account-button").addEventListener("click", () => { window.location.href = "admin.html"; });

document.querySelector(".menu-toggle").addEventListener("click", event => {
  const button = event.currentTarget;
  const nav = document.querySelector(".main-nav");
  const expanded = button.getAttribute("aria-expanded") === "true";
  button.setAttribute("aria-expanded", String(!expanded));
  nav.classList.toggle("nav-open", !expanded);
});
document.querySelectorAll(".main-nav a").forEach(link => {
  link.addEventListener("click", () => {
    document.querySelector(".main-nav").classList.remove("nav-open");
    document.querySelector(".menu-toggle").setAttribute("aria-expanded", "false");
  });
});
document.addEventListener("keydown", event => { if (event.key === "Escape") closeCart(); });

document.querySelector("#current-year").textContent = new Date().getFullYear();
if (supabaseConfig.url !== "SUPABASE_URL" && supabaseConfig.anonKey !== "SUPABASE_ANON_KEY") {
  import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) => {
    supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
    loadProducts();
  }).catch(error => {
    console.error("No se pudo inicializar Supabase.", error);
    catalogStatus.textContent = "No se pudo conectar con Supabase.";
    catalogStatus.hidden = false;
    catalogStatus.dataset.state = "error";
  });
} else {
  loadProducts();
}
