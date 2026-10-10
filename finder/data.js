// ============================================================
// ALL DEMO CONTENT LIVES HERE. Edit freely, then refresh the page.
// Everything is sample data. Nothing is live.
// ============================================================

window.DATA = {
  // Working name and logo letter shown in the header and intro.
  appName: "[APP NAME]",
  logoLetter: "A",

  // The hour the demo pretends it is (0-23). null = use the phone's real clock.
  // Tip: set 15 for an afternoon demo so busyness looks interesting.
  demoHour: null,

  // ---- Activity types (the intro chips). id is used everywhere else. ----
  activities: [
    { id: "ski",    name: "Skiing & snowboarding",   icon: "🎿" },
    { id: "hike",   name: "Hiking",                  icon: "🥾" },
    { id: "climb",  name: "Climbing",                icon: "🧗" },
    { id: "skate",  name: "Skating",                 icon: "⛸️" },
    { id: "bike",   name: "Biking",                  icon: "🚴" },
    { id: "water",  name: "Water & lakes",           icon: "🛶" },
    { id: "parks",  name: "Amusement & trampoline",  icon: "🎢" },
    { id: "arcade", name: "Laser tag & arcades",     icon: "🕹️" },
    { id: "bowl",   name: "Bowling & mini golf",     icon: "🎳" },
    { id: "sports", name: "Pickup sports",           icon: "🏀" },
    { id: "events", name: "Concerts & events",       icon: "🎤" },
    { id: "museum", name: "Museums & zoos",          icon: "🦒" },
  ],

  // ---- Busyness profiles: 15 numbers = 8 AM through 10 PM (0-100). ----
  // 0 means closed. Under 35 = Quiet, under 65 = Moderate, else Busy.
  // Each profile has a weekday and a weekend version.
  profiles: {
    //           8a  9a 10a 11a 12p  1p  2p  3p  4p  5p  6p  7p  8p  9p 10p
    gym:     { weekday: [20, 25, 25, 30, 30, 25, 30, 40, 60, 85, 90, 80, 60, 40, 20],
               weekend: [30, 45, 55, 60, 60, 55, 50, 50, 55, 60, 55, 45, 35, 25, 15] },
    ski:     { weekday: [40, 55, 60, 55, 50, 45, 40, 30, 10,  0,  0,  0,  0,  0,  0],
               weekend: [75, 92, 95, 90, 80, 70, 60, 45, 15,  0,  0,  0,  0,  0,  0] },
    outdoor: { weekday: [15, 20, 25, 30, 35, 35, 40, 45, 50, 45, 35, 20, 10,  5,  5],
               weekend: [25, 35, 50, 60, 70, 85, 90, 85, 70, 55, 40, 25, 15, 10,  5] },
    indoor:  { weekday: [ 0,  0, 15, 25, 30, 30, 40, 50, 60, 70, 75, 70, 55, 35, 20],
               weekend: [ 0,  0, 50, 65, 75, 85, 90, 85, 80, 80, 75, 65, 50, 35, 20] },
    museum:  { weekday: [ 0, 25, 35, 40, 40, 45, 40, 30, 15,  0,  0,  0,  0,  0,  0],
               weekend: [ 0, 45, 65, 75, 80, 75, 65, 50, 20,  0,  0,  0,  0,  0,  0] },
    venue:   { weekday: [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 30, 60, 90, 85, 50],
               weekend: [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  0, 45, 75, 95, 90, 60] },
    rink:    { weekday: [ 0,  0, 10, 15, 25, 20, 20, 30, 45, 55, 70, 75, 50,  0,  0],
               weekend: [ 0, 30, 45, 60, 70, 80, 75, 65, 60, 55, 60, 55, 40,  0,  0] },
  },

  // ---- Places. activity = an id above, profile = a key in profiles. ----
  // miles = distance from central Provo. pitch = one line for Discover.
  places: [
    { id: "sundance",  name: "Sundance Resort",          activity: "ski",    town: "Provo Canyon", miles: 14, profile: "ski",
      conditions: "Fresh snow, 6 in.",   price: "$95 lift ticket",   pitch: "Small, scenic resort with short lift lines" },
    { id: "brighton",  name: "Brighton",                 activity: "ski",    town: "Salt Lake",    miles: 48, profile: "ski",
      conditions: "Packed powder, 24°F", price: "$119 lift ticket",  pitch: "Night skiing and a big terrain park" },
    { id: "pcmr",      name: "Park City Mountain",       activity: "ski",    town: "Park City",    miles: 52, profile: "ski",
      conditions: "Groomed runs, 28°F",  price: "$189 lift ticket",  pitch: "The biggest ski area in the U.S." },
    { id: "ymountain", name: "Y Mountain Trail",         activity: "hike",   town: "Provo",        miles: 2,  profile: "outdoor",
      conditions: "Trail dry",           price: "Free",              pitch: "Steep 1-hour climb with the best view of the valley" },
    { id: "stewart",   name: "Stewart Falls",            activity: "hike",   town: "Provo Canyon", miles: 15, profile: "outdoor",
      conditions: "Some mud near falls", price: "Free",              pitch: "Easy 3.5-mile hike to a 200-ft waterfall" },
    { id: "quarry",    name: "The Quarry",               activity: "climb",  town: "Provo",        miles: 3,  profile: "gym",
      conditions: "Indoor",              price: "$18 day pass",      pitch: "Indoor bouldering, no experience needed" },
    { id: "rockcanyon",name: "Rock Canyon",              activity: "climb",  town: "Provo",        miles: 3,  profile: "outdoor",
      conditions: "Rock dry, 58°F",      price: "Free",              pitch: "Outdoor sport climbing a mile from campus" },
    { id: "peaks",     name: "Peaks Ice Arena",          activity: "skate",  town: "Provo",        miles: 2,  profile: "rink",
      conditions: "Indoor",              price: "$8 open skate",     pitch: "Olympic rink with cheap skate rentals" },
    { id: "provoriver",name: "Provo River Trail",        activity: "bike",   town: "Provo",        miles: 1,  profile: "outdoor",
      conditions: "Trail dry",           price: "Free",              pitch: "Flat, paved, and runs all the way to the lake" },
    { id: "utahlake",  name: "Utah Lake State Park",     activity: "water",  town: "Provo",        miles: 4,  profile: "outdoor",
      conditions: "Calm water, 64°F",    price: "$15 per car",       pitch: "Rent a paddleboard and catch the sunset" },
    { id: "deercreek", name: "Deer Creek Reservoir",     activity: "water",  town: "Heber",        miles: 25, profile: "outdoor",
      conditions: "Light wind",          price: "$20 per car",       pitch: "Kayaks and sailboats under the mountains" },
    { id: "getair",    name: "Get Air Trampoline Park",  activity: "parks",  town: "Orem",         miles: 5,  profile: "indoor",
      conditions: "Indoor",              price: "$17 for 90 min",    pitch: "Dodgeball, foam pits, and ninja courses" },
    { id: "boondocks", name: "Boondocks Fun Center",     activity: "arcade", town: "Draper",       miles: 24, profile: "indoor",
      conditions: "Indoor",              price: "$12 laser tag",     pitch: "Laser tag arena plus a giant arcade" },
    { id: "fatcats",   name: "Fat Cats",                 activity: "bowl",   town: "Provo",        miles: 2,  profile: "indoor",
      conditions: "Indoor",              price: "$5 per game",       pitch: "Cheap bowling and glow mini golf" },
    { id: "kiwanis",   name: "Kiwanis Park Courts",      activity: "sports", town: "Provo",        miles: 2,  profile: "outdoor",
      conditions: "Courts dry, 61°F",    price: "Free",              pitch: "Pickup volleyball and basketball most nights" },
    { id: "velour",    name: "Velour Live Music",        activity: "events", town: "Provo",        miles: 1,  profile: "venue",
      conditions: "Indoor, doors 6 PM",  price: "$12 tickets",       pitch: "Tiny venue where local bands get their start" },
    { id: "ancientlife",name: "Museum of Ancient Life",  activity: "museum", town: "Lehi",         miles: 18, profile: "museum",
      conditions: "Indoor",              price: "$20 entry",         pitch: "Walk among 60 full-size dinosaur skeletons" },
    { id: "hogle",     name: "Hogle Zoo",                activity: "museum", town: "Salt Lake",    miles: 45, profile: "museum",
      conditions: "Sunny, 62°F",         price: "$25 entry",         pitch: "Polar bears, giraffes, and a train ride" },
  ],

  // ---- Community groups. place = a place id above. ----
  groups: [
    { title: "Sunset hike",            place: "ymountain",  when: "Sat 6 PM",   going: 4, spots: 4 },
    { title: "Beginner bouldering",    place: "quarry",     when: "Sat 7 PM",   going: 6, spots: 2 },
    { title: "First chair crew",       place: "sundance",   when: "Sun 8 AM",   going: 3, spots: 1 },
    { title: "Pickup volleyball",      place: "kiwanis",    when: "Mon 7 PM",   going: 9, spots: 3 },
    { title: "Open skate + hot cocoa", place: "peaks",      when: "Fri 8 PM",   going: 5, spots: 5 },
    { title: "Lake paddle",            place: "utahlake",   when: "Sat 5 PM",   going: 2, spots: 6 },
    { title: "Glow bowling night",     place: "fatcats",    when: "Thu 9 PM",   going: 7, spots: 1 },
    { title: "Local bands show",       place: "velour",     when: "Fri 8 PM",   going: 8, spots: 4 },
    { title: "Easy river ride",        place: "provoriver", when: "Sun 10 AM",  going: 3, spots: 5 },
    { title: "Dino museum trip",       place: "ancientlife",when: "Sat 11 AM",  going: 4, spots: 2 },
  ],
};
