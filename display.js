// 展示商品页面
// 从后端获取商品名
const api_url="http://127.0.0.1:5000/";

window.onload=()=>{
    let fruits=document.getElementById("fruit-display");
    let num=location.search.slice(5);//商品编号
    if(!num && num!==0)
        num=1;//默认为1
    // 通过location.search获取get字符串内容

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
