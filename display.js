// 展示商品页面
// 从后端获取商品名
// const api_url="http://124.71.201.17:8084/api/";
const api_url="http://127.0.0.1:5000/";
let product, num=location.search.slice(5);
// 通过location.search获取get字符串内容

window.onload=()=>{
    if(!num){
        // 以防有人没有query直接点进display页
        num="1";
    }
    
    let cur=localStorage.getItem(num);
    if(cur){
    // 如果localstorage有这件商品，那就没必要访问api
    // 这个逻辑合理吗？万一商品更新了？
    // 待讨论
        console.log("cur=")
        console.log(cur)
        console.log("is an object");
        show_product(JSON.parse(cur));
    }
    else{
        fetch(api_url+"display/?num="+num).then(
            res=>res.json()
        ).then(
            data=>{
                // data=JSON.parse(data);
                data.amount=1;
                show_product(data);
            }
        );
    }
}
function show_product(data){
    let fruits=document.getElementById("fruit-display");

    product=data;

    fruits.innerHTML+=`
    <img src="jpg/${data.photo}.jpeg" alt="">
    <div class="descriptions">
        <h1 class="fruit-name">${data.name}</h1>
        <hr>
        <h3 class="price">价格 <span>￥${data.price}</span></h3>
        <input type="number" id="num" value="${data.amount}"><label for="num">数量</label>
        <div class="wrap-but">
            <div onclick="return buy();" class="but-buy">加入购物车</div>
            <div onclick="return remove();" class="but-clear">移除该商品</div>
        </div>
    </div>`;            
}
function buy(){
    // 加入购物车
    let cur=document.getElementById("num").value;
    product['amount']=cur;
    localStorage.setItem(num,JSON.stringify(product));
    // alert(cur)
}
function remove(){
    // 清除出购物车
    localStorage.removeItem(num);
    document.getElementById("num").value='1';
    alert("已移除该商品");
}