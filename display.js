// 展示商品页面
// 从后端获取商品名
const api_url="http://127.0.0.1:5000/";
let product, num=location.search.slice(5);//商品编号

window.onload=()=>{
    let fruits=document.getElementById("fruit-display");

    if(!num && num!==0)
        num=1;//默认为1
    // 通过location.search获取get字符串内容

    fetch(api_url+"display/?num="+num).then(
        res=>res.json()
    ).then(
        data=>{
            product=data;
            let cur=localStorage.getItem(num);
            if(!cur)
                cur=1;
            cur=parseInt(cur);
            fruits.innerHTML+=`
            <img src="jpg/${data[0]}.jpeg" alt="">
            <div class="descriptions">
                <h1 class="fruit-name">${data[1]}</h1>
                <hr>
                <h3 class="price">价格 <span>￥${data[2]}</span></h3>
                <input type="number" id="num" value="${cur}"><label for="num">数量</label>
                <div class="wrap-but">
                    <div onclick="return buy();" class="but-buy">加入购物车</div>
                    <div onclick="return remove();" class="but-clear">移除该商品</div>
                </div>
            </div>`;
        }
    );
}
function buy(){
    // 加入购物车
    let cur=document.getElementById("num").value;
    localStorage.setItem(num,cur);
    // alert(cur)
}
function remove(){
    // 清除出购物车
    localStorage.removeItem(num);
    document.getElementById("num").value='1';
    alert("已移除该商品");
}