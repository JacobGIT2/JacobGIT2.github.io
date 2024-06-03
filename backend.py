from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)
products = [
    ["橙子", "山东橙子", "20"],
    ["苹果", "红富士苹果", "20"],
    ["菠萝","台湾菠萝","35"]
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
    target = products[int(request.args.get('num'))]
    return jsonify(target)


app.run(port="127.0.0.1:9300")
