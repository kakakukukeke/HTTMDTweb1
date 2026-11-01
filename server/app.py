import json, os, secrets, time
from datetime import datetime, date
from functools import wraps
from flask import Flask, jsonify, request, send_from_directory

BASE = os.path.dirname(os.path.abspath(__file__))
PUBLIC = os.path.join(BASE, "..", "public")
DATA = os.path.join(BASE, "data")
ADMIN_USER, ADMIN_PASS = "admin", "admin123"
SHIPPING = {"standard": {"name": "Giao tiêu chuẩn (2-4 ngày)", "fee": 30000, "freeFrom": 5000000},
            "fast": {"name": "Giao nhanh (trong ngày)", "fee": 50000, "freeFrom": None}}
ORDER_STATUS = ["pending", "processing", "shipping", "delivered", "cancelled"]
tokens = set()
app = Flask(__name__, static_folder=None)


def load(name):
    with open(os.path.join(DATA, name + ".json"), encoding="utf-8") as f:
        return json.load(f)


def save(name, data):
    with open(os.path.join(DATA, name + ".json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def err(msg, code):
    return jsonify(error=msg), code


def admin_only(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        if request.headers.get("Authorization", "").replace("Bearer ", "") not in tokens:
            return err("Chưa đăng nhập", 401)
        return fn(*a, **kw)
    return wrapper


def crud(name, numeric=()):
    """Tạo GET/POST/PUT/DELETE /api/admin/<name> cho một bộ dữ liệu."""
    def fix(b):
        b = dict(b or {})
        for k in numeric:
            b[k] = int(float(b.get(k) or 0))
        return b

    def lst():
        return jsonify(load(name))

    def add():
        items = load(name)
        it = fix(request.get_json(silent=True))
        it["id"] = max([x["id"] for x in items], default=0) + 1
        items.append(it)
        save(name, items)
        return jsonify(it), 201

    def edit(i):
        items = load(name)
        for k, x in enumerate(items):
            if x["id"] == i:
                items[k] = {**x, **fix(request.get_json(silent=True)), "id": i}
                save(name, items)
                return jsonify(items[k])
        return err("Không tìm thấy", 404)

    def rm(i):
        save(name, [x for x in load(name) if x["id"] != i])
        return "", 204

    base = f"/api/admin/{name}"
    app.add_url_rule(base, f"{name}_list", admin_only(lst))
    app.add_url_rule(base, f"{name}_add", admin_only(add), methods=["POST"])
    app.add_url_rule(base + "/<int:i>", f"{name}_edit", admin_only(edit), methods=["PUT"])
    app.add_url_rule(base + "/<int:i>", f"{name}_rm", admin_only(rm), methods=["DELETE"])


crud("products", ("price", "oldPrice", "stock"))
crud("categories")
crud("brands")
crud("promos", ("percent", "minTotal"))
crud("posts")


# ---------- API công khai (khách hàng) ----------
@app.get("/api/products")
def list_products():
    items = load("products")
    g = request.args.get
    if g("category"): items = [p for p in items if p["category"] == g("category")]
    if g("brand"): items = [p for p in items if p["brand"] == g("brand")]
    if g("min"): items = [p for p in items if p["price"] >= int(g("min"))]
    if g("max"): items = [p for p in items if p["price"] <= int(g("max"))]
    if g("featured"): items = [p for p in items if p.get("featured")]
    if g("q"): items = [p for p in items if g("q").lower() in (p["name"] + p["brand"] + p["sku"]).lower()]
    return jsonify(items)


@app.get("/api/products/<int:pid>")
def get_product(pid):
    p = next((x for x in load("products") if x["id"] == pid), None)
    return jsonify(p) if p else err("Không tìm thấy sản phẩm", 404)


@app.get("/api/categories")
def pub_categories():
    return jsonify(load("categories"))


@app.get("/api/brands")
def pub_brands():
    return jsonify(load("brands"))


@app.get("/api/shipping")
def shipping():
    return jsonify([{"id": k, **v} for k, v in SHIPPING.items()])


@app.get("/api/posts")
def pub_posts():
    t = request.args.get("type", "news")
    return jsonify(sorted([p for p in load("posts") if p["type"] == t], key=lambda p: p["date"], reverse=True))


@app.get("/api/posts/<slug>")
def pub_post(slug):
    p = next((x for x in load("posts") if x["slug"] == slug), None)
    return jsonify(p) if p else err("Không tìm thấy bài viết", 404)


def check_promo(code, subtotal):
    p = next((x for x in load("promos") if x["code"].upper() == (code or "").upper()), None)
    if not p or not p.get("active"):
        return None, "Mã giảm giá không hợp lệ"
    today = date.today().isoformat()
    if (p.get("start") and today < p["start"]) or (p.get("end") and today > p["end"]):
        return None, "Mã giảm giá đã hết hạn hoặc chưa bắt đầu"
    if subtotal < p["minTotal"]:
        return None, f"Đơn tối thiểu {p['minTotal']:,}₫ để dùng mã này".replace(",", ".")
    return {"code": p["code"], "name": p["name"], "percent": p["percent"], "discount": subtotal * p["percent"] // 100}, None


@app.post("/api/promos/check")
def promo_check():
    b = request.get_json(silent=True) or {}
    r, e = check_promo(b.get("code"), int(b.get("total") or 0))
    return jsonify(r) if r else err(e, 400)


@app.post("/api/orders")
def create_order():
    b = request.get_json(silent=True) or {}
    c, items = b.get("customer") or {}, b.get("items") or []
    if not (c.get("name") and c.get("phone") and c.get("address") and items):
        return err("Thiếu thông tin đặt hàng", 400)
    products = {p["id"]: p for p in load("products")}
    lines, sub = [], 0
    for i in items:
        p = products.get(int(i.get("id", 0)))
        if not p: continue
        qty = max(1, int(i.get("qty") or 1))
        sub += p["price"] * qty
        lines.append({"id": p["id"], "name": p["name"], "price": p["price"], "qty": qty})
    if not lines:
        return err("Giỏ hàng không có sản phẩm hợp lệ", 400)
    promo, discount = None, 0
    if b.get("promo"):
        promo, e = check_promo(b["promo"], sub)
        if not promo: return err(e, 400)
        discount = promo["discount"]
    sh = SHIPPING.get(b.get("shipping"), SHIPPING["standard"])
    fee = 0 if sh["freeFrom"] and sub >= sh["freeFrom"] else sh["fee"]
    order = {"code": "N10-" + format(int(time.time() * 1000), "X")[-8:], "customer": c, "items": lines,
             "subtotal": sub, "discount": discount, "promo": promo["code"] if promo else "",
             "shipping": sh["name"], "shippingFee": fee, "total": sub - discount + fee,
             "payment": b.get("payment") or "COD (mô phỏng)", "status": "pending",
             "createdAt": datetime.now().isoformat()}
    orders = load("orders")
    orders.insert(0, order)
    save("orders", orders)
    return jsonify(order), 201


@app.get("/api/orders/track")
def track():
    q = (request.args.get("q") or "").strip()
    res = [o for o in load("orders") if q and (o["code"] == q.upper() or o["customer"]["phone"] == q)]
    return jsonify(res) if res else err("Không tìm thấy đơn hàng với thông tin này", 404)


@app.post("/api/contacts")
def contact():
    b = request.get_json(silent=True) or {}
    if not (b.get("name") and b.get("email") and b.get("message")):
        return err("Vui lòng nhập họ tên, email và nội dung", 400)
    cs = load("contacts")
    cs.insert(0, {"id": max([x["id"] for x in cs], default=0) + 1, "name": b["name"], "email": b["email"],
                  "message": b["message"], "reply": "", "createdAt": datetime.now().isoformat()})
    save("contacts", cs)
    return jsonify(ok=True), 201


# ---------- API admin riêng ----------
@app.post("/api/admin/login")
def login():
    b = request.get_json(silent=True) or {}
    if b.get("username") == ADMIN_USER and b.get("password") == ADMIN_PASS:
        t = secrets.token_hex(16)
        tokens.add(t)
        return jsonify(token=t)
    return err("Sai tài khoản hoặc mật khẩu", 401)


@app.get("/api/admin/stats")
@admin_only
def stats():
    o = load("orders")
    return jsonify(products=len(load("products")), orders=len(o), pending=sum(x["status"] == "pending" for x in o),
                   revenue=sum(x["total"] for x in o if x["status"] != "cancelled"),
                   contacts=sum(not x["reply"] for x in load("contacts")), promos=sum(bool(x["active"]) for x in load("promos")))


@app.get("/api/admin/orders")
@admin_only
def all_orders():
    return jsonify(load("orders"))


@app.put("/api/admin/orders/<code>")
@admin_only
def update_order(code):
    st = (request.get_json(silent=True) or {}).get("status")
    if st not in ORDER_STATUS: return err("Trạng thái không hợp lệ", 400)
    orders = load("orders")
    for o in orders:
        if o["code"] == code:
            o["status"] = st
            save("orders", orders)
            return jsonify(o)
    return err("Không tìm thấy đơn hàng", 404)


@app.get("/api/admin/contacts")
@admin_only
def all_contacts():
    return jsonify(load("contacts"))


@app.put("/api/admin/contacts/<int:i>")
@admin_only
def reply_contact(i):
    cs = load("contacts")
    for c in cs:
        if c["id"] == i:
            c["reply"] = (request.get_json(silent=True) or {}).get("reply", "")
            save("contacts", cs)
            return jsonify(c)
    return err("Không tìm thấy", 404)


# ---------- Phục vụ giao diện ----------
def serve(folder, f):
    return send_from_directory(os.path.join(PUBLIC, folder), f)


@app.get("/admin/")
def admin_page(): return serve("admin", "index.html")
@app.get("/admin/<path:f>")
def admin_files(f): return serve("admin", f)git --version
@app.get("/shared/<path:f>")
def shared_files(f): return serve("shared", f)
@app.get("/")
def store_page(): return serve("store", "index.html")
@app.get("/<path:f>")
def store_files(f): return serve("store", f)


if __name__ == "__main__":
    print("TAQstore - Cửa hàng: http://localhost:3000  |  Admin: http://localhost:3000/admin/")
    app.run(port=3000, debug=True)