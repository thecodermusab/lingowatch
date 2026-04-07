export interface ReaderRow {
  id: string;
  source: string;
  target: string;
}

export const MOCK_READER_DATA_DEFAULT: ReaderRow[] = [
  {
    id: "r1",
    source: "Josiah Franklin, and Abiah his wife, lie here interred.",
    target: "Josiah Franklin, iyo Abiah xaaskiisa, halkan waxaa lagu aasay."
  },
  {
    id: "r2",
    source: "They lived lovingly together in wedlock fifty-five years.",
    target: "Si naxariis leh ayay ugu wada noolaayeen guurka konton iyo shan sano."
  },
  {
    id: "r3",
    source: "Without an estate, or any gainful employment, By constant labor and industry, with God's blessing,",
    target: "Iyagoo aan haysan hanti, ama shaqo faa'iido leh, Iyadoo loo marayo dadaal joogto ah iyo dadaal, iyadoo ducada Ilaah ay la socoto,"
  },
  {
    id: "r4",
    source: "They maintained a large family comfortably, and brought up thirteen children and seven grandchildren reputably.",
    target: "Waxay si raaxo leh ulahaayeen qoys weyn, waxayna si sharaf leh u kuku een saddex iyo toban carruur ah iyo toddobaaw carruur ah."
  },
  {
    id: "r5",
    source: "From this instance, reader, Be encouraged to diligence in thy calling, And distrust not Providence.",
    target: "Ka soo qaado tusaalahan, akhristow, Ku dhiirranow dadaalkaaga, Oo ha ka shakinin Ilaah."
  },
  {
    id: "r6",
    source: "He was a pious and prudent man; She, a discreet and virtuous woman.",
    target: "Wuxuu ahaa nin xurmo leh oo xikmad leh; iyadu, naag xishood leh oo wanaagsan."
  },
  {
    id: "r7",
    source: "Their youngest son, In filial regard to their memory, Places this stone.",
    target: "Wiilkoodii ugu yaraa, Oo xurmo u leh xusuustooda, ayaa dhagaxan dhigay."
  },
  {
    id: "r8",
    source: "J. F. born 1655, died 1744, Ætat 89.",
    target: "J. F. waxa dhashay 1655, waxa dhimatay 1744, da'diisu ahayd 89."
  },
  {
    id: "r9",
    source: "A.",
    target: "A."
  },
  {
    id: "r10",
    source: "F. born 1667, died 1752,----85.",
    target: "F. waxa dhashay 1667, waxa dhimatay 1752,----85."
  }
];

export const MOCK_READER_DICTIONARY: Record<string, { title: string; rows: ReaderRow[] }> = {
  "default": {
    title: "Autobiography of Benjamin Franklin",
    rows: MOCK_READER_DATA_DEFAULT
  },
  "335": {
    title: "A Good Friend",
    rows: [
      {
        id: "rf1",
        source: "Yasin’s family moved from Iraq to England when he was just a young boy.",
        target: "Qoyska Yasiin waxay ka guureen Ciraaq oo ay u guureen Ingiriiska isagoo weli wiil yar ah."
      },
      {
        id: "rf2",
        source: "Yasin did not want to leave his home in Samarra but his father said that it was best for the family...",
        target: "Yasiin ma uusan dooneynin inuu ka tago gurigiisa Samarra, laakiin aabbihiis ayaa sheegay inay u roon tahay qoyska maxaa yeelay ammaan ma ahayn mar dambe."
      },
      {
        id: "rf3",
        source: "...and he wanted his son to grow up in a country that was accepting of all people.",
        target: "...wuxuuna doonayay in wiilkiisa ku koro wadan soo dhaweynaya dadka oo dhan."
      },
      {
        id: "rf4",
        source: "Yasin’s father told his son that England was a multicultural country where people lived and worked together regardless of race or religious beliefs.",
        target: "Aabaha Yasiin ayaa u sheegay in Ingiriisku yahay wadan dhaqamo kala duwan leh oo dadku ku wada nool yihiin si nabad ah iyadoon loo eegin jinsiyad."
      },
      {
        id: "rf5",
        source: "Although Yasin was not happy about leaving Iraq, he soon settled into his new life in a big city called London.",
        target: "In kasta oo Yasiin uusan ku faraxsanayn inuu ka tago Ciraaq, dhawaan wuxuu la qabsaday noloshiisa cusub ee magaalo weyn oo la yiraahdo London."
      },
      {
        id: "rf6",
        source: "London was very exciting with its tall buildings and museums, and Yasin especially liked the London Planetarium and the big River Thames with all of its old bridges.",
        target: "London waxay ahay mid aad u xiiso badan oo leh dhismayaal dhaadheer, Yasiin wuxuu si gaar ah u jeclaa wabiga Thames iyo buundooyinkiisa."
      },
      {
        id: "rf7",
        source: "Yasin even made friends with a boy who lived next door, called Andrew.",
        target: "Yasiin wuxuu xitaa la saaxiibay wiil la deris ah, oo la yiraahdo Andrew."
      },
      {
        id: "rf8",
        source: "All summer long, Andrew and Yasin played in the park or went to the zoo with Andrew’s mum.",
        target: "Xilliga xagaaga oo dhan, Andrew iyo Yasiin waxay ku ciyaarayeen beerta ama waxay aadaan goobta xayawaanka."
      },
      {
        id: "rf9",
        source: "Andrew shared his toys and his comics with Yasin and told him all about his favourite superheroes.",
        target: "Andrew wuxuu la wadaagay caruusadaha iyo majaladaha majaajillada ah Yasiin wuxuuna u sheegay geesiyaasha uu jecel yahay."
      },
      {
        id: "rf10",
        source: "They even built a camp in Yasin’s back garden where they would hide from the grownups.",
        target: "Xitaa waxay xero ka dhex dhisteen beerta dambe ee Yasiin oo ay uga dhuuntaan dadka waaweyn."
      },
      {
        id: "rf11",
        source: "The summer was a fun time and young Yasin soon felt quite at home in London even though it was a very big city and not nearly as sunny and hot as it was in Samarra.",
        target: "Xagaagu wuxuu ahaa waqti lagu farxo, dhawaanna Yasiin wuxuu dareemay sidii isagoo jooga gurigiisa London inkasta oo cimiladu aanay kuleyl ahayn."
      },
      {
        id: "rf12",
        source: "His English got better and better, especially with help from Andrew, although there were a lot of words that Yasin did not understand and he often felt silly because he couldn’t speak as well as he would like.",
        target: "Afkiisa Ingiriisiga si fiican ayuu u soo koray, gaar ahaan kaalmada Andrew, in kasta oo uu inta badan isula muuqan jiray nacasiin markuusan si fiican u hadlin."
      },
      {
        id: "rf13",
        source: "When September finally came around and the leaves began to fall from the trees, Yasin’s father explained that it was time for his son to go to school.",
        target: "Markii ugu dambayntii bishii Sebteembar timid oo caleemihii dhirta qallaleen, aabaha Yasiin wuxuu u sheegay inay la joogo waqtigii iskuulka."
      },
      {
        id: "rf14",
        source: "Yasin was seven years old so he would be going to year three of the local primary school – the same year as his friend Andrew!",
        target: "Yasiin wuxuu jiray toddobo sano, sidaas darteed wuxuu gali jiray fasalka saddexaad iskuulka deegaanka – isku meel saaxiibkiis Andrew!"
      },
      {
        id: "rf15",
        source: "Although Yasin was very nervous about going to school, his father and mother assured him that it would be a fun place where he would meet lots of new friends and learn lots of interesting new things.",
        target: "In kasta oo Yasiin uu aad u kacsan yahay inuu tegi iskuulka, waalidkii ayaa u xaqiijiyay inay tahay meel farxad leh oo uu ku baran doono saaxiibo cusub."
      },
      {
        id: "rf16",
        source: "‘English schools are supposed to be very good,’ said Yasin’s mother. ‘And your English will get better in no time,’ assured his father.",
        target: "Iskuulada Ingariiska ayaa la filayaa inay fiican yihiin, ayay tiri hooyadiis. Afkaaguna wuxuu fiicnaan doonaa waqti yar, ayuu xaqiijiyay aabbihiis."
      },
      {
        id: "rf17",
        source: "Yasin was still not convinced, but when Andrew knocked on the door that morning with a big smile on his face saying how fun it was going to be at school, Yasin felt much better because he trusted his friend.",
        target: "Yasiin weli kuma qanacsanayn iskuulka laakiin markii saaxiibkiis Andrew u yimid wuu ku kalsoonaaday."
      },
      {
        id: "rf18",
        source: "The two boys chatted all the way to the school gates. Andrew told Yasin about the playground and who was the best teacher and what boys were the most fun...",
        target: "Labada wiil waxay u sheekeysanayeen ilaa albaabka iskuulka. Andrew wax badan ayuu uga sheekeeyey macallimiinta iyo ciyaarta."
      },
      {
        id: "rf19",
        source: "But when the boys got to their class, things did not go how Yasin imagined they would. The teacher told Andrew to take a seat at the front of the class as she introduced Yasin to the rest of the children.",
        target: "Markii ay iskuulka galeen wax sidii Yasiin filayay ma dhicin, macalimadii waxay kala saartay yasiin iyo andrew."
      },
      {
        id: "rf20",
        source: "He did not like standing up in front of the class and one boy shouted that he was a smelly foreigner. The boys and girls all laughed...",
        target: "Ma uusan jeclayn inuu soo hor istaago fasalka wiil kale oo aan fiicneyn ayaa caayay yasiin isagoo leh waa shisheeye ureysa. caruurtii ayaa wada qoslay."
      },
      {
        id: "rf21",
        source: "Finally, Yasin was allowed to take a seat at the back of the class but he wished that he was sitting next to Andrew as he felt very alone.",
        target: "Ugu dambayntii, waxaa loo ogolaaday Yasiin inuu fariisto dhabarka fasalka laakiin wuxuu ka jeclaa inuu fariisto dhinaca Andrew maadaama uu kali dareemay."
      },
      {
        id: "rf22",
        source: "When the bell went, it was time to go out into the playground. The teacher kept Yasin back for a moment and gave him a badge with his name on which she pinned to his jumper.",
        target: "Markii garaacgu dhacay, waxay ahayd waqtigii garoonka ciyaaraha la aadi lahaa. Macalimaddu waxay siisay astaan magaciisa ku qoran tahay."
      },
      {
        id: "rf23",
        source: "‘There you go,’ she said with a smile. ‘Now all of the children will be able to learn your name.’",
        target: "‘Waatan,’ ayay tiri iyadoo dhoola caddaynaysa. ‘Hadda carruurta oo dhan way garan doonaan magacaaga.’"
      },
      {
        id: "rf24",
        source: "He was very sad and wanted to run out of the playground back to his mother and father and never return to school again. But just as he was about to run, he heard a familiar voice.",
        target: "Aad ayuu u murugooday oo wuxuu doonayay inuu u fakado hooyadiis iyo aabbihiis oo aanu dib ugu soo noqon iskuulka. Laakiin markuu roori rabay wuxuu maqlay cod saaxiibkiis."
      },
      {
        id: "rf25",
        source: "‘Hi Yasin.’ And when he looked up there was Andrew standing right beside him. Andrew looked at the children gathered around and shook his head. ‘What’s wrong with you lot?’ he asked.",
        target: "‘Nabad Yasiin.’ Markuu soo fiiriyay wuxuu arkay Andrew. Andrew ayaa canaantay caruurtii kale isagoo weydiinaya maxaa vka qaldan."
      },
      {
        id: "rf26",
        source: "‘We are all different and that is what makes us interesting. What would life be like if we were all the same as one another?’",
        target: "‘Culumadeena waa kala duwan yihiin taasi uun baa nolosha macaan ka dhigaysa,’ ayuu yiri Andrew siduu uga jawaabayay jeesjeeskii."
      },
      {
        id: "rf27",
        source: "There was silence among the children. Then Yasin lifted his head high. ‘Boring,’ he said with a smile.",
        target: "Aamusnaan baa dhacady, yasiin madaxiisa ayuu kor uqaaday wuxuuna yiri \"way caajisnimo lahayd.\""
      },
      {
        id: "rf28",
        source: "And with that all of the children began to laugh. ‘Really boring,’ they chanted at one another.",
        target: "Dhammaan caruurtii ayaa qoslay waxayna isla qireen in noloshu caajis tahay hadii la wada ekaado."
      },
      {
        id: "rf29",
        source: "Yasin felt so lucky to have a good friend like Andrew who stood up for people and did not judge them just because they were different.",
        target: "Yasiin wuxuu dareemay nasiib uu ku heley saaxiib fiican sidii Andrew oo kale ee u istaaga dadka si aanan loogu xukumin kala duwanaantooda."
      }
    ]
  }
};
