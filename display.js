// 展示商品页面
// 从后端获取商品名
const api_url="http://127.0.0.1:5000/";

window.onload=()=>{
    let fruits=document.getElementById("fruit-display");
    let num=location.search | 1;//默认为1

    fetch(api_url+"display/?num="+num).then(
        res=>res.json()
    ).then(
        data=>{
            fruits.innerHTML+=`
                <div class="fruit-choice">
                    <img src="jpg/${data[0]}.jpeg" alt="">
                    <h4 class="fruit-name">${data[1]}</h4>
                    <p class="price">价格 <span>￥${data[2]}</span></p>
                    <div class="but-buy">购买</div>
                </div>`;
        }
    );
}
