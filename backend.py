from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
products = [
    ["橙子", "山东橙子", "20"],
    ["苹果", "红富士苹果", "20"],
    ["菠萝", "台湾菠萝", "35"]
]
# 按编号储存！
ans = []
for p in products:
    ans.append({
        "photo": p[0],
        "name": p[1],
        "price": p[2]
    })


@app.route("/get_products/", methods=["GET", "POST"])
def get_products():
    return jsonify(ans)


@app.route("/display/", methods=["GET"])
def display_product():
    target = ans[int(request.args.get('num'))]
    # 通过编号访问
    return jsonify(target)


@app.route("/cart/", methods=["GET", "POST"])
def cart_info():
    # 前端发回JSON格式
    # {1:a,2:b}
    # 返回总额
    total = 0
    data = request.json

    for i in data:
        amount = int(data[i]) # 买了多少个
        cur = products[int(i)]  # 当前商品信息
        price = amount * int(cur[2])  # 总价
        total += price

    return jsonify({'total': total})


app.run(port=5000)  # 按需求修改
