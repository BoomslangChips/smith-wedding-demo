/* THE SMITH WEDDING: a made-up wedding for the public demo of a wedding website. Every name, place and date here is invented. */
window.WEDDING_SETTINGS = { FULL_ADMIN_URL: '#' };
window.SMITH_DEMO = true;
window.SMITH_DEMO_LINK = 'https://github.com/BoomslangChips/smith-wedding-demo#readme';
window.SMITH_TIP_LINK = "";
window.DEFAULT_CONFIG = {
 "couple": {
  "one": "James",
  "two": "Sophie",
  "fullOne": "James Smith",
  "fullTwo": "Sophie Clarke",
  "title": "The Smith Wedding"
 },
 "wedding": {
  "date": "2027-09-18",
  "ceremonyTime": "15:00",
  "venue": "Highland Meadow Estate",
  "town": "Mistvale, The Highlands",
  "address": "1 Meadow Lane, Mistvale",
  "mapUrl": ""
 },
 "welcome": {
  "heading": "Come for the wedding, stay for the weekend",
  "text": "We would love for you to spend the whole weekend with us in the beautiful highlands of Mistvale. Think golf and spa days, a welcome dinner in the Orchard, a wedding day full of love and dancing, and a slow Sunday of gin tasting and brunch in town. We cannot wait to celebrate with you."
 },
 "rsvp": {
  "deadline": "2027-07-16",
  "allowLate": false,
  "intro": "Please let us know by {deadline} whether you will be joining us, which parts of the weekend you will be there for, and what you would like to eat.",
  "closedText": "Our RSVP deadline has passed. If you still need to let us know something, please contact James or Sophie directly.",
  "notFound": "We couldn't find that name on our guest list. Please use your full name as it appears on your invitation, or the code from your personal invitation link.",
  "choices": {
   "byInvitation": {
    "fri-golf": "golf"
   },
   "oneOf": [
    {
     "id": "fri-day",
     "events": [
      "fri-golf",
      "fri-spa"
     ],
     "title": "Golf or a spa day",
     "question": "Friday during the day",
     "none": "Neither, thank you",
     "noneHint": "See you at the welcome dinner"
    }
   ]
  },
  "askStay": true,
  "stayQuestion": "Where will you stay?",
  "stayOptions": [
   {
    "id": "estate",
    "label": "A room on the estate",
    "hint": "Book it with us here: we will confirm your room with you personally",
    "labelVenue": "On the estate",
    "hintVenue": "You book your room with the estate yourself"
   },
   {
    "id": "nearby",
    "label": "Somewhere else nearby",
    "hint": "In or around Mistvale"
   },
   {
    "id": "day",
    "label": "Day guest",
    "hint": "Coming for the day, not staying over"
   },
   {
    "id": "unsure",
    "label": "Not sure yet",
    "hint": "We will check in with you closer to the time"
   }
  ],
  "rooms": {
   "nightsLegend": "Which nights would you like the room?",
   "nightsLegendVenue": "Which nights will you stay?",
   "nights": [
    {
     "id": "fri",
     "label": "Friday 17 September"
    },
    {
     "id": "sat",
     "label": "Saturday 18 September"
    },
    {
     "id": "sun",
     "label": "Sunday 19 September",
     "hint": "Optional: leave on Monday 20 September"
    }
   ],
   "peopleLabel": "How many people in the room?",
   "heldTitle": "Your room on the estate",
   "heldNote": "A room on the estate is set aside for you, so there is nothing to look for.",
   "heldDecline": "We will not need the room",
   "heldDeclineHint": "We are staying somewhere else, or coming for the day",
   "confirmNote": "Rooms are limited. We will be in touch to confirm yours."
  }
 },
 "menu": {
  "intro": "Please choose a starter, main course and dessert for each guest attending the wedding.",
  "courses": [
   {
    "id": "starter",
    "title": "Starter",
    "choose": true,
    "options": [
     {
      "id": "starter-soup",
      "name": "Roasted tomato and basil soup",
      "desc": "Served with a dollop of crème fraîche"
     },
     {
      "id": "starter-carpaccio",
      "name": "Beef & beet carpaccio",
      "desc": "Served with feta mousse, balsamic reduction and micro herbs"
     }
    ]
   },
   {
    "id": "sorbet",
    "title": "Sorbet",
    "choose": false,
    "options": [
     {
      "id": "sorbet-mango",
      "name": "Mango and mint sorbet",
      "desc": ""
     }
    ]
   },
   {
    "id": "main",
    "title": "Main Course",
    "choose": true,
    "options": [
     {
      "id": "main-lamb",
      "name": "Red wine braised lamb shank",
      "desc": "Served on a bed of mashed potatoes"
     },
     {
      "id": "main-fillet",
      "name": "Beef fillet steak",
      "desc": "300g grilled fillet served with parmesan potato bake, roasted mixed vegetables and red wine reduction"
     }
    ]
   },
   {
    "id": "dessert",
    "title": "Dessert",
    "choose": true,
    "options": [
     {
      "id": "dessert-brulee",
      "name": "Crème brûlée with blueberries",
      "desc": ""
     },
     {
      "id": "dessert-brownie",
      "name": "Duo of chocolate brownies",
      "desc": "Served with ice cream (white and dark chocolate layers)"
     }
    ]
   }
  ]
 },
 "accommodation": {
  "mode": "venue",
  "heading": "Stay at the venue",
  "text": "Accommodation is available on the estate, so you can wake up where the celebrations happen. Please book your room directly with the estate, using the contact below and our reference for booking.",
  "phone": "+44 1632 960100",
  "email": "stay@highlandmeadow.example",
  "reference": "Smith Wedding",
  "breakfastIncluded": false,
  "emailSubject": "Accommodation request: {ref}",
  "emailBody": "Hi Eleanor,\n\nI will be attending the Smith Wedding and would like to request accommodation on the estate.\n\nBooking reference: {ref}\n\nName: \nNumber of guests: \n\nKind regards,\n"
 },
 "days": [
  {
   "id": "fri",
   "label": "Friday",
   "date": "2027-09-17",
   "title": "Arrival & Welcome",
   "dress": "Smart Casual",
   "events": [
    {
     "id": "fri-golf",
     "start": "10:00",
     "end": "16:00",
     "title": "Golf for the Gents",
     "location": "Mistvale Golf Club",
     "desc": "The boys hit the fairways at Mistvale Golf Club. Golf is for your own account and fills up fast, so please let James know as soon as possible if you would like to play.",
     "rsvp": true,
     "rsvpLabel": "Friday golf at Mistvale Golf Club (own account)"
    },
    {
     "id": "fri-spa",
     "start": "10:00",
     "end": "16:00",
     "title": "Spa Day for the Ladies",
     "location": "Highland Meadow Estate Spa",
     "desc": "A relaxing day of massages and pampering for the ladies. Treatments are for your own account.",
     "rsvp": true,
     "rsvpLabel": "Friday spa massages (own account)"
    },
    {
     "id": "fri-dinner",
     "start": "16:30",
     "end": "21:00",
     "title": "Welcome Dinner in the Orchard",
     "location": "The Orchard fire pit",
     "desc": "Everyone gets together for the first time this weekend. Food is provided; drinks are for your own account.",
     "rsvp": true,
     "rsvpLabel": "Friday welcome dinner (Orchard)"
    }
   ]
  },
  {
   "id": "sat",
   "label": "Saturday",
   "date": "2027-09-18",
   "title": "The Wedding Day",
   "dress": "Semi-formal (in our colour palette)",
   "events": [
    {
     "id": "sat-arrival",
     "start": "14:30",
     "end": "15:00",
     "title": "Guest Arrival",
     "location": "The gardens at the Great Barn",
     "desc": "Arrive, find your seat and settle in.",
     "rsvp": false
    },
    {
     "id": "sat-ceremony",
     "start": "15:00",
     "end": "16:00",
     "title": "The Ceremony",
     "location": "The gardens at the Great Barn",
     "desc": "The moment we say \"I do\".",
     "rsvp": true,
     "rsvpLabel": "Saturday wedding (ceremony & reception)"
    },
    {
     "id": "sat-canapes",
     "start": "16:00",
     "end": "18:00",
     "title": "Canapés & Lawn Games",
     "location": "The garden at the Great Barn",
     "desc": "Drinks, canapés and games on the lawn while we take photos.",
     "rsvp": false
    },
    {
     "id": "sat-dinner",
     "start": "18:00",
     "end": "19:30",
     "title": "Reception Dinner",
     "location": "The Great Barn event hall",
     "desc": "Take your seats for dinner.",
     "rsvp": false
    },
    {
     "id": "sat-speeches",
     "start": "19:30",
     "end": "20:30",
     "title": "Speeches",
     "location": "The Great Barn event hall",
     "desc": "Raise a glass, and maybe a tissue.",
     "rsvp": false
    },
    {
     "id": "sat-dance",
     "start": "20:30",
     "end": "late",
     "title": "First Dance & Dancing",
     "location": "The Great Barn event hall",
     "desc": "Our first dance as husband and wife, then the dance floor is yours until late.",
     "rsvp": false
    }
   ]
  },
  {
   "id": "sun",
   "label": "Sunday",
   "date": "2027-09-19",
   "title": "Slow Sunday",
   "dress": "Casual",
   "events": [
    {
     "id": "sun-morning",
     "start": "",
     "end": "",
     "title": "Chill Morning",
     "location": "Wherever you are staying",
     "desc": "Sleep in, take a walk and enjoy the fresh highland air.",
     "rsvp": false
    },
    {
     "id": "sun-lunch",
     "start": "12:00",
     "end": "15:00",
     "title": "Gin Tasting & Brunch",
     "location": "Mistvale",
     "desc": "We get together in town for a gin tasting and brunch.",
     "rsvp": true,
     "rsvpLabel": "Sunday gin tasting & brunch"
    }
   ]
  },
  {
   "id": "mon",
   "label": "Monday",
   "date": "2027-09-20",
   "title": "Farewell",
   "dress": "Casual",
   "events": [
    {
     "id": "mon-breakfast",
     "start": "08:30",
     "end": "10:30",
     "title": "Farewell Breakfast",
     "location": "Highland Meadow Estate",
     "desc": "One last breakfast together before check-out and the road home.",
     "rsvp": false
    }
   ]
  }
 ],
 "weddingEventId": "sat-ceremony",
 "dressCode": {
  "intro": "We would love our photos to glow in our Misty Highlands palette. Here is what to wear across the weekend.",
  "friday": {
   "title": "Smart Casual",
   "when": "Golf, the spa & the Orchard fire pit",
   "text": "Friday night in the Orchard: think chinos and a collared shirt, a pretty day dress or smart jeans with a nice top. Evenings in Mistvale can get chilly, so bring a jacket or wrap.",
   "tip": "Highland evenings turn cool quickly: a warm knit, jacket or wrap for the fire pit is a must."
  },
  "saturday": {
   "title": "Semi-formal",
   "when": "The ceremony & reception, in our palette",
   "text": "Saturday is semi-formal and within our colour palette. Gents: a suit, or a collared shirt and smart trousers with a belt (a jacket is welcome but not needed), in slate, sage, stone, navy, dusty blue, burgundy or blush. Ladies: tea-length or floor-length dresses in blush, dusk rose, heather mauve, soft sage, slate, dusty blue, navy or burgundy. Kindly leave white and ivory to the bride.",
   "tip": "We say our vows on the garden lawns, so block heels or wedges will be kinder than stilettos on the grass."
  },
  "sunday": {
   "title": "Relaxed",
   "when": "A slow morning, then gin tasting & brunch",
   "text": "Sunday is slow and easy: sleep in, then join us for a gin tasting and brunch in Mistvale. Wear whatever feels comfortable, like jeans or smart shorts, a soft knit or a relaxed dress. Monday's farewell breakfast is just as casual.",
   "tip": "Comfortable shoes for strolling the village, and a light jacket: highland weather likes to change its mind."
  },
  "party": {
   "title": "Our Wedding Party",
   "text": "Our bridesmaids will be in Sage Mist and our groomsmen in Stone Khaki, so you will spot them easily on the day."
  },
  "paletteText": "Soft, serene and timeless: the colours of the highlands at dusk, with dusty blue, navy and burgundy for depth. Wear them on Saturday, mix them and layer them.",
  "ladies": "Tea-length or floor-length, in soft flowing fabrics like silk, satin, chiffon or crepe.",
  "gents": "A suit, or a collared shirt and smart trousers with a belt, in any of these. A jacket and a tie are optional; a pocket square in a softer shade is a lovely touch.",
  "note": "Moonbone and Champagne are lovely as accents (ties, pocket squares, accessories) rather than a full outfit.",
  "bride": "Kindly leave white and ivory to the bride."
 },
 "palette": [
  {
   "name": "Blush",
   "hex": "#F0C4CB",
   "wear": "both"
  },
  {
   "name": "Dusk Rose",
   "hex": "#B48A93",
   "wear": "ladies"
  },
  {
   "name": "Heather Mauve",
   "hex": "#9E7F8E",
   "wear": "ladies"
  },
  {
   "name": "Night Sage",
   "hex": "#8E9A92",
   "wear": "gents"
  },
  {
   "name": "Sage Mist",
   "hex": "#B9C4BD",
   "wear": "ladies"
  },
  {
   "name": "Slate Eucalyptus",
   "hex": "#5A6964",
   "wear": "both"
  },
  {
   "name": "Stone Sand",
   "hex": "#D6CBBE",
   "wear": "gents"
  },
  {
   "name": "Dusty Blue",
   "hex": "#8FA6B8",
   "wear": "both"
  },
  {
   "name": "Midnight Navy",
   "hex": "#27334A",
   "wear": "both"
  },
  {
   "name": "Burgundy",
   "hex": "#6E2D3C",
   "wear": "both"
  },
  {
   "name": "Champagne",
   "hex": "#FBEAD6",
   "wear": "accent"
  },
  {
   "name": "Moonbone",
   "hex": "#F2EEE9",
   "wear": "accent"
  }
 ],
 "bridalParty": {
  "intro": "The people who have loved us, laughed with us and put up with us. We are so grateful they will be standing beside us.",
  "people": [
   {
    "name": "Olivia Bennett",
    "role": "Maid of Honour",
    "group": "bride",
    "photo": "w/img/party/olivia-bennett.jpg"
   },
   {
    "name": "Chloe Martin",
    "role": "Bridesmaid",
    "group": "bride",
    "photo": "w/img/party/chloe-martin.jpg"
   },
   {
    "name": "Grace Turner",
    "role": "Bridesmaid & Officiant",
    "group": "bride",
    "photo": "w/img/party/grace-turner.jpg"
   },
   {
    "name": "Lily Cooper",
    "role": "Bridesmaid",
    "group": "bride",
    "photo": "w/img/party/lily-cooper.jpg"
   },
   {
    "name": "Emma Clarke",
    "role": "Bridesmaid & Sister",
    "group": "bride",
    "photo": "w/img/party/emma-clarke.jpg"
   },
   {
    "name": "Daniel Hughes",
    "role": "Best Man",
    "group": "groom",
    "photo": "w/img/party/daniel-hughes.jpg"
   },
   {
    "name": "Thomas Reid",
    "role": "Groomsman",
    "group": "groom",
    "photo": "w/img/party/thomas-reid.jpg"
   },
   {
    "name": "Lucas Smith",
    "role": "Groomsman & Brother",
    "group": "groom",
    "photo": "w/img/party/lucas-smith.jpg"
   },
   {
    "name": "Ethan Brooks",
    "role": "Groomsman",
    "group": "groom",
    "photo": "w/img/party/ethan-brooks.jpg"
   },
   {
    "name": "Noah Carter",
    "role": "Groomsman",
    "group": "groom",
    "photo": "w/img/party/noah-carter.jpg"
   },
   {
    "name": "Henry Walsh",
    "role": "Master of Ceremonies",
    "group": "mc",
    "photo": "w/img/party/henry-walsh.jpg",
    "cutout": "w/img/party/henry-walsh-cutout.webp"
   }
  ]
 },
 "photos": {
  "hero": "w/img/shoot-123.jpg",
  "portrait": "w/img/shoot-40.jpg",
  "story": "w/img/demo/story.jpg",
  "highlights": [
   {
    "src": "w/img/demo/h1.jpg",
    "caption": ""
   },
   {
    "src": "w/img/demo/h2.jpg",
    "caption": ""
   },
   {
    "src": "w/img/demo/h3.jpg",
    "caption": ""
   }
  ],
  "venue": [
   {
    "src": "w/img/demo/venue-1.jpg",
    "caption": "The gardens"
   },
   {
    "src": "w/img/demo/venue-2.jpg",
    "caption": "The Great Barn"
   },
   {
    "src": "w/img/demo/venue-3.jpg",
    "caption": "The Great Barn event hall"
   },
   {
    "src": "w/img/demo/venue-4.jpg",
    "caption": "The Estate & Paddocks"
   }
  ],
  "gallery": [
   {
    "src": "w/img/demo/g1-640.webp",
    "mid": "w/img/demo/g1-1080.webp",
    "full": "w/img/demo/g1-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g2-640.webp",
    "mid": "w/img/demo/g2-1080.webp",
    "full": "w/img/demo/g2-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g3-640.webp",
    "mid": "w/img/demo/g3-1080.webp",
    "full": "w/img/demo/g3-1800.webp",
    "w": 1800,
    "h": 1200,
    "caption": ""
   },
   {
    "src": "w/img/demo/g4-640.webp",
    "mid": "w/img/demo/g4-1080.webp",
    "full": "w/img/demo/g4-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g5-640.webp",
    "mid": "w/img/demo/g5-1080.webp",
    "full": "w/img/demo/g5-1800.webp",
    "w": 1800,
    "h": 1200,
    "caption": ""
   },
   {
    "src": "w/img/demo/g6-640.webp",
    "mid": "w/img/demo/g6-1080.webp",
    "full": "w/img/demo/g6-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g7-640.webp",
    "mid": "w/img/demo/g7-1080.webp",
    "full": "w/img/demo/g7-1800.webp",
    "w": 1800,
    "h": 1200,
    "caption": ""
   },
   {
    "src": "w/img/demo/g8-640.webp",
    "mid": "w/img/demo/g8-1080.webp",
    "full": "w/img/demo/g8-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g9-640.webp",
    "mid": "w/img/demo/g9-1080.webp",
    "full": "w/img/demo/g9-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g10-640.webp",
    "mid": "w/img/demo/g10-1080.webp",
    "full": "w/img/demo/g10-1800.webp",
    "w": 1800,
    "h": 1200,
    "caption": ""
   },
   {
    "src": "w/img/demo/g11-640.webp",
    "mid": "w/img/demo/g11-1080.webp",
    "full": "w/img/demo/g11-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g12-640.webp",
    "mid": "w/img/demo/g12-1080.webp",
    "full": "w/img/demo/g12-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g13-640.webp",
    "mid": "w/img/demo/g13-1080.webp",
    "full": "w/img/demo/g13-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g14-640.webp",
    "mid": "w/img/demo/g14-1080.webp",
    "full": "w/img/demo/g14-1800.webp",
    "w": 1800,
    "h": 1200,
    "caption": ""
   },
   {
    "src": "w/img/demo/g15-640.webp",
    "mid": "w/img/demo/g15-1080.webp",
    "full": "w/img/demo/g15-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g16-640.webp",
    "mid": "w/img/demo/g16-1080.webp",
    "full": "w/img/demo/g16-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g17-640.webp",
    "mid": "w/img/demo/g17-1080.webp",
    "full": "w/img/demo/g17-1800.webp",
    "w": 1800,
    "h": 1200,
    "caption": ""
   },
   {
    "src": "w/img/demo/g18-640.webp",
    "mid": "w/img/demo/g18-1080.webp",
    "full": "w/img/demo/g18-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g19-640.webp",
    "mid": "w/img/demo/g19-1080.webp",
    "full": "w/img/demo/g19-1800.webp",
    "w": 1800,
    "h": 1200,
    "caption": ""
   },
   {
    "src": "w/img/demo/g20-640.webp",
    "mid": "w/img/demo/g20-1080.webp",
    "full": "w/img/demo/g20-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g21-640.webp",
    "mid": "w/img/demo/g21-1080.webp",
    "full": "w/img/demo/g21-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g22-640.webp",
    "mid": "w/img/demo/g22-1080.webp",
    "full": "w/img/demo/g22-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g23-640.webp",
    "mid": "w/img/demo/g23-1080.webp",
    "full": "w/img/demo/g23-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   },
   {
    "src": "w/img/demo/g24-640.webp",
    "mid": "w/img/demo/g24-1080.webp",
    "full": "w/img/demo/g24-1800.webp",
    "w": 1200,
    "h": 1800,
    "caption": ""
   }
  ]
 },
 "nearby": [
  {
   "id": "old-mill-house",
   "name": "The Old Mill House",
   "area": "Mistvale village",
   "blurb": "A restored stone mill with six rooms, a fire in every lounge and breakfast in the garden.",
   "phone": "+44 1632 960101",
   "email": "stay@oldmillhouse.example",
   "url": "https://oldmillhouse.example/",
   "distanceKm": 4,
   "driveMin": 7,
   "mapUrl": "#stay",
   "photos": [
    {
     "src": "w/img/demo/stay-1.jpg",
     "caption": "The Old Mill House"
    }
   ]
  },
  {
   "id": "thatch-and-thyme",
   "name": "Thatch & Thyme Cottage",
   "area": "Mistvale village",
   "blurb": "A thatched cottage for four, with a wood stove and a kitchen garden you may pick from.",
   "phone": "+44 1632 960102",
   "email": "stay@thatchandthyme.example",
   "url": "https://thatchandthyme.example/",
   "distanceKm": 5,
   "driveMin": 8,
   "mapUrl": "#stay",
   "photos": [
    {
     "src": "w/img/demo/stay-2.jpg",
     "caption": "Thatch & Thyme Cottage"
    }
   ]
  },
  {
   "id": "rosewood-country-house",
   "name": "Rosewood Country House",
   "area": "On the hill above Mistvale",
   "blurb": "A country house hotel with a small spa, long views and dinner by candlelight.",
   "phone": "+44 1632 960103",
   "email": "stay@rosewoodcountryhouse.example",
   "url": "https://rosewoodcountryhouse.example/",
   "distanceKm": 6,
   "driveMin": 10,
   "mapUrl": "#stay",
   "photos": [
    {
     "src": "w/img/demo/stay-3.jpg",
     "caption": "Rosewood Country House"
    }
   ]
  },
  {
   "id": "glen-farm",
   "name": "Glen Farm",
   "area": "The road to the pass",
   "blurb": "A farmhouse in the valley for families and groups, with horses in the next field.",
   "phone": "+44 1632 960104",
   "email": "stay@glenfarm.example",
   "url": "https://glenfarm.example/",
   "distanceKm": 11,
   "driveMin": 16,
   "mapUrl": "#stay",
   "photos": [
    {
     "src": "w/img/demo/stay-4.jpg",
     "caption": "Glen Farm"
    }
   ]
  },
  {
   "id": "the-white-row",
   "name": "The White Row",
   "area": "Just outside Mistvale",
   "blurb": "Whitewashed cottages side by side on a quiet lane, each with its own fireplace.",
   "phone": "+44 1632 960105",
   "email": "stay@thewhiterow.example",
   "url": "https://thewhiterow.example/",
   "distanceKm": 3,
   "driveMin": 5,
   "mapUrl": "#stay",
   "photos": [
    {
     "src": "w/img/demo/stay-5.jpg",
     "caption": "The White Row"
    }
   ]
  },
  {
   "id": "stonecroft",
   "name": "Stonecroft Guest House",
   "area": "Mistvale village",
   "blurb": "Eight rooms in an old stone farmhouse, a short walk from the village shops.",
   "phone": "+44 1632 960106",
   "email": "stay@stonecroft.example",
   "url": "https://stonecroft.example/",
   "distanceKm": 4,
   "driveMin": 6,
   "mapUrl": "#stay",
   "photos": [
    {
     "src": "w/img/demo/stay-6.jpg",
     "caption": "Stonecroft Guest House"
    }
   ]
  }
 ],
 "faq": [
  {
   "icon": "users",
   "q": "Are children welcome?",
   "a": "We love your little ones, but our wedding weekend is for adults only. We hope you enjoy a relaxing weekend away with us."
  },
  {
   "icon": "car",
   "q": "Is there parking at the venue?",
   "a": "Yes, there is ample parking at Highland Meadow Estate."
  },
  {
   "icon": "umbrella",
   "q": "What will the weather be like?",
   "a": "September in the highlands is usually mild during the day and cool at night, and a shower is never far away. Please bring something warm for the evenings."
  },
  {
   "icon": "camera-off",
   "q": "Can I take photos during the ceremony?",
   "a": "Our ceremony will be phone free. Please keep your phone tucked away so you can be fully present with us. Our photographer will capture every moment."
  },
  {
   "icon": "gift",
   "q": "Do you have a gift registry?",
   "a": "Having you with us is the greatest gift. (On a real invitation, the couple’s gift details are here, behind the invitation code.)"
  },
  {
   "icon": "flag",
   "q": "Who pays for the golf and spa on Friday?",
   "a": "Golf at Mistvale Golf Club and treatments at the estate spa are for your own account. Golf is by invitation, as places are limited."
  }
 ],
 "footerNote": "Made with love for our family and friends."
};
