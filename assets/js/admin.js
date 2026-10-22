import { supabaseConfig } from "./config.js";

const notice = document.querySelector("#admin-notice");
const toast = document.querySelector("#admin-toast");
const loginPanel = document.querySelector("#login-panel");
const dashboard = document.querySelector("#dashboard");
const form = document.querySelector("#product-form");
const list = document.querySelector("#admin-product-list");
const imageInput = form.elements.image;
document.querySelector('#login-form [name="email"]').value = supabaseConfig.ownerEmail;
let supabase;
let toastTimer;
let products = [];
let deliveries = new Map();

const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const isHttpsUrl = value => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};

function setNotice(message) {
  notice.textContent = message;
  notice.hidden = !message;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("visible"), 3200);
}

function setSignedIn(user) {
  loginPanel.hidden = Boolean(user);
  dashboard.hidden = !user;
  document.querySelector("#admin-email").textContent = user?.email || "";
}

async function requireOwner(user) {
  if (!user || user.email?.toLocaleLowerCase() !== supabaseConfig.ownerEmail.toLocaleLowerCase()) {
    if (user) await supabase.auth.signOut();
    setSignedIn(null);
    return false;
  }
  await loadAdminProducts();
  setNotice("");
  setSignedIn(user);
  return true;
}

function loginErrorMessage(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login credentials") || message.includes("user not found")) {
    return "Correo o contraseña incorrectos, o la cuenta aún no existe. En Supabase abre Authentication → Users → Add user y crea josegood222@gmail.com con una contraseña nueva. Luego vuelve aquí y usa esa misma contraseña.";
  }
  if (message.includes("email not confirmed")) {
    return "Supabase aún no confirmó el correo. Abre Authentication → Users, busca tu usuario y confirma su email; después intenta entrar de nuevo.";
  }
  if (message.includes("too many requests") || message.includes("rate limit")) {
    return "Se hicieron muchos intentos. Espera unos minutos y vuelve a probar.";
  }
  return `Supabase no permitió iniciar sesión: ${error?.message || "error de conexión"}. Comprueba tu usuario en Authentication → Users.`;
}

function renderAdminProducts() {
  if (!products.length) {
    list.innerHTML = '<p class="field-help">Todavía no has agregado bases.</p>';
    return;
  }
  list.innerHTML = products.map(product => `
    <article class="admin-product-row">
      <div class="admin-product-thumb">${product.image_url ? `<img src="${escapeHtml(product.image_url)}" alt="">` : '<i class="fa-solid fa-chess-rook" aria-hidden="true"></i>'}</div>
      <div class="admin-product-meta"><strong>${escapeHtml(product.name)}</strong><span>${escapeHtml(product.town_hall)} · ${product.is_free ? "Gratis" : `$${Number(product.price).toFixed(2)} USD`} · ${product.is_published ? "Publicada" : "Borrador"}</span></div>
      <div class="admin-product-actions"><button type="button" data-action="edit" data-id="${escapeHtml(product.id)}">Editar</button><button type="button" data-action="visibility" data-id="${escapeHtml(product.id)}">${product.is_published ? "Ocultar" : "Publicar"}</button><button class="delete" type="button" data-action="delete" data-id="${escapeHtml(product.id)}">Eliminar</button></div>
    </article>`).join("");
}

async function loadAdminProducts() {
  list.innerHTML = '<p class="field-help">Cargando...</p>';
  const [{ data, error }, { data: deliveryData, error: deliveryError }] = await Promise.all([
    supabase.from("products").select("*").order("created_at", { ascending: false }),
    supabase.from("product_deliveries").select("product_id,design_link")
  ]);
  if (error) throw error;
  if (deliveryError) throw deliveryError;
  products = data;
  deliveries = new Map(deliveryData.map(item => [item.product_id, item.design_link]));
  renderAdminProducts();
}

function resetForm() {
  form.reset();
  form.elements.id.value = "";
  form.elements.price.value = "1.00";
  form.elements.bundleCount.value = "0";
  form.elements.isPublished.checked = true;
  form.elements.category.disabled = false;
  form.elements.price.disabled = false;
  imageInput.required = false;
  document.querySelector("#form-title").textContent = "Agregar una base";
  document.querySelector("#cancel-edit").hidden = true;
}

function editProduct(product) {
  form.elements.id.value = product.id;
  form.elements.name.value = product.name;
  form.elements.townHall.value = product.town_hall;
  form.elements.category.value = product.category === "free" ? "legend" : product.category;
  form.elements.description.value = product.description;
  form.elements.isFree.checked = product.is_free;
  form.elements.price.value = Number(product.price).toFixed(2);
  form.elements.bundleCount.value = product.bundle_count || 0;
  form.elements.designLink.value = product.is_free ? product.free_link || "" : deliveries.get(product.id) || "";
  form.elements.isPublished.checked = product.is_published;
  form.elements.category.disabled = product.is_free;
  form.elements.price.disabled = product.is_free;
  imageInput.required = false;
  document.querySelector("#form-title").textContent = "Editar base";
  document.querySelector("#cancel-edit").hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function uploadImage(file) {
  if (!file) return null;
  const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
    throw new Error("Selecciona una imagen JPG, PNG o WebP de máximo 5 MB.");
  }
  const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!supabase) {
    setNotice("Configura Supabase en assets/js/config.js antes de iniciar sesión.");
    return;
  }
  const submit = event.currentTarget.querySelector('button[type="submit"]');
  submit.disabled = true;
  const formData = new FormData(event.currentTarget);
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: String(formData.get("email")).trim(),
      password: String(formData.get("password"))
    });
    if (error) {
      setNotice(loginErrorMessage(error));
      console.error("Error de autenticación de Supabase.", error);
      return;
    }
    if (!await requireOwner(data.user)) setNotice("Esta cuenta no está autorizada para administrar la tienda.");
  } catch (loadError) {
    setSignedIn(null);
    setNotice(`No se pudo cargar el panel: ${loadError.message || "revisa que hayas ejecutado supabase/setup.sql en SQL Editor."} Si el error menciona la tabla products, ejecuta ese archivo primero.`);
    console.error("No se pudo cargar el panel privado.", loadError);
  } finally {
    submit.disabled = false;
  }
});

form.elements.isFree.addEventListener("change", event => {
  const free = event.target.checked;
  form.elements.category.disabled = free;
  form.elements.price.disabled = free;
  if (free) {
    form.elements.price.value = "0";
    form.elements.category.value = "legend";
  } else if (Number(form.elements.price.value) === 0) {
    form.elements.price.value = "1.00";
  }
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const formData = new FormData(form);
    const free = form.elements.isFree.checked;
    const designLink = String(formData.get("designLink")).trim();
    if (!isHttpsUrl(designLink)) throw new Error("El enlace del diseño debe comenzar con https://.");
    const file = imageInput.files[0];
    const current = form.elements.id.value ? products.find(product => product.id === form.elements.id.value) : null;
    const imageUrl = await uploadImage(file) || current?.image_url || null;
    const row = {
      name: String(formData.get("name")).trim(),
      town_hall: String(formData.get("townHall")).trim(),
      category: free ? "free" : String(formData.get("category")),
      description: String(formData.get("description")).trim(),
      price: free ? 0 : Number(formData.get("price")),
      image_url: imageUrl,
      free_link: free ? designLink : null,
      bundle_count: free ? 0 : Number(formData.get("bundleCount")) || 0,
      is_free: free,
      is_published: form.elements.isPublished.checked
    };
    if (!free && (!Number.isFinite(row.price) || row.price <= 0)) throw new Error("El precio premium debe ser mayor que cero.");
    let result = current
      ? await supabase.from("products").update(row).eq("id", current.id).select("id").single()
      : await supabase.from("products").insert(row).select("id").single();
    if (result.error) throw result.error;
    const productId = result.data.id;
    if (free) {
      const { error } = await supabase.from("product_deliveries").delete().eq("product_id", productId);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("product_deliveries").upsert({ product_id: productId, design_link: designLink }, { onConflict: "product_id" });
      if (error) throw error;
    }
    await loadAdminProducts();
    resetForm();
    showToast("Base guardada.");
  } catch (error) {
    setNotice(error.message || "No se pudo guardar la base. Revisa la conexión y las políticas.");
    console.error("Error al guardar el producto.", error);
  } finally {
    submit.disabled = false;
  }
});

list.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const product = products.find(item => item.id === button.dataset.id);
  if (!product) return;
  try {
    if (button.dataset.action === "edit") {
      editProduct(product);
      return;
    }
    if (button.dataset.action === "visibility") {
      const { error } = await supabase.from("products").update({ is_published: !product.is_published }).eq("id", product.id);
      if (error) throw error;
      await loadAdminProducts();
      showToast(product.is_published ? "Base retirada del catálogo." : "Base publicada.");
    }
    if (button.dataset.action === "delete" && window.confirm(`¿Eliminar “${product.name}”? Esta acción no se puede deshacer.`)) {
      const { error: deliveryError } = await supabase.from("product_deliveries").delete().eq("product_id", product.id);
      if (deliveryError) throw deliveryError;
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw error;
      await loadAdminProducts();
      resetForm();
      showToast("Base eliminada.");
    }
  } catch (error) {
    setNotice(error.message || "No se pudo completar la acción solicitada.");
    console.error("Error al administrar el catálogo.", error);
  }
});

document.querySelector("#cancel-edit").addEventListener("click", resetForm);
document.querySelector("#sign-out").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    setNotice("No se pudo cerrar la sesión.");
    console.error("Error al cerrar sesión.", error);
    return;
  }
  setSignedIn(null);
  resetForm();
});

if (supabaseConfig.url === "SUPABASE_URL" || supabaseConfig.anonKey === "SUPABASE_ANON_KEY") {
  setNotice("Falta configurar Supabase: completa la URL, la anon key y el correo autorizado en assets/js/config.js.");
} else if (supabaseConfig.ownerEmail === "TU_CORREO_DE_ADMIN") {
  setNotice("La URL y la clave pública están configuradas. Falta definir tu correo administrador en assets/js/config.js y ejecutar supabase/setup.sql.");
} else {
  import("https://esm.sh/@supabase/supabase-js@2").then(async ({ createClient }) => {
    supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session) {
      try { await requireOwner(data.session.user); }
      catch (loadError) {
        setNotice("No se pudo abrir el panel. Revisa las tablas y políticas de Supabase.");
        console.error("No se pudo restaurar el panel.", loadError);
      }
    }
  }).catch(error => {
    setNotice("No se pudo conectar con Supabase. Revisa la URL, la clave y tu conexión.");
    console.error("Error al inicializar Supabase Auth.", error);
  });
}
