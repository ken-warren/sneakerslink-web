/* =========================================================
   SneakersLink — product catalog
   =========================================================
   This is the single source of truth for every product card
   and detail page on the site. To add, remove, or reprice a
   product, edit the array below and save — every page that
   shows that product updates automatically.

   Loaded as a plain script (not fetch), so it works whether
   the site is opened straight from a folder (double-clicked)
   or served from a real domain — no local server required.

   Fields:
     id            unique slug (auto-generated if you leave
                    it out — brand + name, lowercased)
     brand         e.g. "Adidas"
     name          e.g. "Black Samba OG"
     price         plain number, e.g. 3100 (no "Kes", no commas)
     image         main product photo, e.g. "img/sneakers/s1.png"
     images        array of photos for the detail-page gallery
                    (defaults to [image] if you skip this)
     sizes         array of available sizes (defaults to 36-45)
     collections   array of tags used to filter which grid a
                    product shows in, e.g. ["all", "new"]
     rating        1-5 (defaults to 5)
     description   shown on the product detail page
   ========================================================= */

window.SNEAKERLINK_PRODUCTS = [
  {
    "id": "samba-black",
    "brand": "Adidas",
    "name": "Black Samba OG",
    "price": 3100,
    "image": "img/sneakers/s1.png",
    "images": [
      "img/sneakers/s1.png"
    ],
    "sizes": [
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45
    ],
    "rating": 5,
    "collections": [
      "all",
      "demand",
      "new"
    ],
    "description": "The Samba OG returns in stealth black, built on the original low-profile silhouette that's been on courts and streets since 1950. A smooth leather upper, gum rubber outsole, and the classic three-stripe branding make it as easy to dress up as it is to wear every day."
  },
  {
    "id": "samba-white",
    "brand": "Adidas",
    "name": "Samba OG White",
    "price": 3100,
    "image": "img/sneakers/s2.jpeg",
    "images": [
      "img/sneakers/s2.jpeg"
    ],
    "sizes": [
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45
    ],
    "rating": 5,
    "collections": [
      "all",
      "demand",
      "new"
    ],
    "description": "A crisp white take on the Samba OG. Soft leather upper, suede overlays, and a gum outsole give it that lived-in look from day one, while the low-profile build keeps it comfortable for all-day wear."
  },
  {
    "id": "samba-royal",
    "brand": "Adidas",
    "name": "Samba OG White/Royal",
    "price": 3100,
    "image": "img/sneakers/s3.jpeg",
    "images": [
      "img/sneakers/s3.jpeg"
    ],
    "sizes": [
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45
    ],
    "rating": 5,
    "collections": [
      "all",
      "demand",
      "new"
    ],
    "description": "White leather meets a royal blue trim on this Samba OG colourway \u2014 a sharper, sportier read on the classic silhouette without losing any of the comfort or durability that made it a staple."
  },
  {
    "id": "samba-cdg",
    "brand": "Adidas",
    "name": "Samba x CDG Valentines",
    "price": 3300,
    "image": "img/sneakers/s4.jpeg",
    "images": [
      "img/sneakers/s4.jpeg"
    ],
    "sizes": [
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45
    ],
    "rating": 5,
    "collections": [
      "all",
      "demand",
      "new"
    ],
    "description": "A limited-edition drop inspired by the Comme des Gar\u00e7ons Valentine's collaborations \u2014 the familiar Samba shape gets a playful, collector-grade colour treatment that stands out without shouting."
  },
  {
    "id": "campus-black-white-gum",
    "brand": "Adidas",
    "name": "Campus 00s Black White Gum",
    "price": 3500,
    "image": "img/sneakers/c1.jpeg",
    "images": [
      "img/sneakers/c1.jpeg"
    ],
    "sizes": [
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45
    ],
    "rating": 5,
    "collections": [
      "all",
      "demand",
      "new"
    ],
    "description": "The Adidas Campus 00s combines classic style with modern comfort, making it an ideal choice for everyday wear. A soft suede upper, reinforced toe cap, and iconic three-stripe detailing sit on a cushioned midsole and grippy gum outsole for lasting comfort and stability."
  },
  {
    "id": "campus-bliss-lilac",
    "brand": "Adidas",
    "name": "Campus 00s Bliss Lilac",
    "price": 3500,
    "image": "img/sneakers/c2.jpeg",
    "images": [
      "img/sneakers/c2.jpeg"
    ],
    "sizes": [
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45
    ],
    "rating": 5,
    "collections": [
      "all",
      "demand",
      "new"
    ],
    "description": "A softer, lilac-tinted take on the Campus 00s. Suede upper, OrthoLite sockliner, and the same reinforced toe cap and grippy outsole \u2014 a gentle colourway that still holds up to daily wear."
  },
  {
    "id": "campus-grey-white",
    "brand": "Adidas",
    "name": "Campus 00s Grey White",
    "price": 3500,
    "image": "img/sneakers/c3.jpeg",
    "images": [
      "img/sneakers/c3.jpeg"
    ],
    "sizes": [
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45
    ],
    "rating": 5,
    "collections": [
      "all",
      "demand",
      "new"
    ],
    "description": "A neutral grey and white colourway that pairs with everything. Same suede build, cushioned midsole, and durable rubber outsole that's made the Campus 00s a streetwear staple."
  },
  {
    "id": "campus-full-black",
    "brand": "Adidas",
    "name": "Campus 00s Full Black",
    "price": 3500,
    "image": "img/sneakers/c4.jpeg",
    "images": [
      "img/sneakers/c4.jpeg"
    ],
    "sizes": [
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45
    ],
    "rating": 5,
    "collections": [
      "all",
      "demand",
      "new"
    ],
    "description": "An all-black Campus 00s for anyone who wants the silhouette without the colour statement. Suede upper, reinforced toe cap, cushioned midsole, and grippy outsole \u2014 the same comfort in a tonal finish."
  }
]
;
