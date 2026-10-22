const STORAGE_KEY = "clash-legend-store-cart-v2";

function readSavedCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved.filter(item =>
      item && typeof item.id === "string" &&
      Number.isInteger(item.quantity) && item.quantity > 0 &&
      typeof item.name === "string" && Number.isFinite(item.price) && item.price >= 0
    );
  } catch (error) {
    console.warn("No se pudo leer el carrito guardado.", error);
    return [];
  }
}

export class Cart {
  constructor(onChange) {
    this.items = readSavedCart();
    this.onChange = onChange;
    this.notify();
  }

  add(product) {
    const item = this.items.find(entry => entry.id === product.id);
    if (item) item.quantity += 1;
    else this.items.push({ id: product.id, name: product.name, price: product.price, image: product.image, townHall: product.townHall, quantity: 1 });
    this.notify();
  }

  update(id, delta) {
    const item = this.items.find(entry => entry.id === id);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) this.remove(id);
    else this.notify();
  }

  remove(id) {
    this.items = this.items.filter(item => item.id !== id);
    this.notify();
  }

  get count() {
    return this.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  get total() {
    return this.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  notify() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch (error) {
      console.warn("No se pudo guardar el carrito en este navegador.", error);
    }
    this.onChange(this);
  }
}
