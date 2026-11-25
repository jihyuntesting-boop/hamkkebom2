/* Operator-published access information. Collection is a document review, not a site inspection. */
(() => {
  const collectedAt = '2026-11-23';
  const palaceParking = 'https://royal.khs.go.kr/ROYAL/contents/R707000000.do';
  const palaceMap = 'https://royal.khs.go.kr/ROYAL/contents/R701000000.do?schGroupCode=gbg';
  const palaceTour = 'https://access.visitkorea.or.kr/magazine/detail.do?cotId=ee65b9aa-ef70-45e4-acd4-27c1982d4019';
  const museumAccess = 'https://www.museum.go.kr/MUSEUM/contents/M0105000000.do?menuId=accessibility';
  const museumEntrance = 'https://www.museum.go.kr/MUSEUM/contents/M0701040000.do?arcId=21412&catCustomType=post&catId=93&cp=23&schM=view&sv=';
  const majangAccess = 'https://access.visitkorea.or.kr/opentour/detail.do?cotId=314ae82d-603c-4108-8bd9-823328d67e61';
  const majangParking = 'https://access.visitkorea.or.kr/cos/detail.do?cotId=c9005a8e-fa87-42a7-9b17-db80d9c0804b';
  const ddpAccess = 'https://access.visitkorea.or.kr/ms/detail.do?cotId=6f689f35-fc7e-44f1-a64c-d1f900f98086';
  const ddpParking = 'https://forum.seoul.go.kr/ssc2019/en/about/directions';
  const forestAccess = 'https://www.seouldanurim.net/recommend/458';
  const forestParking = 'https://seoulforest.or.kr/info/faq';
  const fact = (topic, label, description, scope, source, sourceUrl) => ({
    topic, label, description, scope, source, sourceUrl, collectedAt, status: 'source_reported'
  });

  window.hbLocalAccessGuides = {
    'tour-126508': {
      arrival: {name: '경복궁 지상주차장', mapQuery: '경복궁주차장'},
      entrance: {name: '흥례문 입구'},
      facts: [
        fact('dropoff', '차량으로 갈 때', '광화문에서 삼청동 방향으로 들어가는 초입 왼쪽에 주차장이 있어요. 휠체어 이용자는 장애인 주차 구역 9면이 있는 지상주차장을 이용하라는 안내가 있어요. 차량 정차 후 바로 내릴 수 있는 별도 지점은 확인이 필요해요.', '경복궁 지상주차장', '궁능유적본부 오시는 길', palaceParking),
        fact('entrance', '흥례문에서 관람 시작', '한국관광공사는 흥례문 광장에서 시작하는 경복궁 무장애 해설 코스를 소개해요. 흥례문 입구에서 휠체어를 빌릴 수 있으나 수량이 한정돼 있어요.', '흥례문 입구 및 광장', '한국관광공사 열린관광 모두의 여행', palaceTour),
        fact('wheelchair', '휠체어 관람 동선', '공식 관람 지도에서 휠체어·유모차가 이용할 수 있는 길과 휠체어 리프트·대여소를 표시해요. 주차장부터 입구까지 연결 경로와 단차는 방문 전에 확인해 주세요.', '경복궁 공식 관람 지도에 표시된 구간', '궁능유적본부 관람코스', palaceMap),
        fact('toilet', '화장실 위치', '공식 관람 지도에서 화장실 위치를 볼 수 있어요. 장애인 화장실의 정확한 위치와 접근 경로는 방문 전에 확인해 주세요.', '경복궁 공식 관람 지도', '궁능유적본부 관람코스', palaceMap)
      ]
    },
    'tour-129703': {
      map: {
        connections: [0, 1],
        image: 'https://www.museum.go.kr/ux/content/images/display/facility/bg_byfloor_img_1.png',
        official: 'https://www.museum.go.kr/MUSEUM/contents/M0103070000.do',
        linkLabel: '국립중앙박물관 공식 층별 안내 열기',
        caption: '주차층에서 전시실까지의 이동 안내와 박물관 공식 층별 지도를 함께 볼 수 있어요.',
        stops: [
          ['지하 1층 장애인 주차', '건물 지하 1층 장애인 주차 구역을 이용할 수 있어요. 택시 승하차 지점은 별도 확인이 필요해요.'],
          ['엘리베이터로 1층', '박물관 안내에 따르면 지하 1층 주차장에서 엘리베이터로 상설전시실 1층에 갈 수 있어요.'],
          ['상설전시실 1층', '1층에 휠체어 대여소와 충전소가 있어요.']
        ]
      },
      arrival: {name: '박물관 지하 1층 장애인 주차 구역', mapQuery: '국립중앙박물관 주차장 서울 용산구'},
      restroom: {location: '상설전시실 1층 남녀 장애인 화장실', sourceUrl: museumAccess},
      entrance: {name: '국립중앙박물관 상설전시관 주출입구'},
      facts: [
        fact('dropoff', '자동차·대중교통으로 갈 때', '박물관 지하 1층에 장애인 주차 구역 24면이 있어요. 이촌역에서는 박물관 나들길 엘리베이터를 이용할 수 있고, 400·502번 저상버스는 국립중앙박물관·용산가족공원 정류장에 서요. 택시 전용 하차 지점은 확인이 필요해요.', '국립중앙박물관 교통편', '국립중앙박물관 접근성 안내', museumAccess),
        fact('entrance', '상설전시관 주출입구', '상설전시관 주출입구에는 자동문이 설치되어 있어요. 주출입구 앞쪽 외부 경로의 경사와 단차는 확인이 필요해요.', '상설전시관 주출입구', '국립중앙박물관 보도자료', museumEntrance),
        fact('elevator', '주차장에서 전시실로', '지하 1층 주차장 안의 엘리베이터로 상설 전시실 1층에 갈 수 있어요. 상설전시관 안에서 층을 옮길 때도 엘리베이터를 이용할 수 있어요.', '주차장 지하 1층 → 상설 전시실 1층 및 전시관 층간 이동', '국립중앙박물관 접근성 안내', museumAccess),
        fact('wheelchair', '전시실 휠체어 이용', '박물관은 상설 전시실에서 휠체어로 이동할 수 있다고 안내해요. 1층에는 휠체어 대여소와 충전소가 있어요.', '상설 전시실', '국립중앙박물관 접근성 안내', museumAccess),
        fact('rest', '쉬어갈 곳', '상설전시관 공식 층별 지도에서 휴게 공간 표시를 확인할 수 있어요. 이용할 공간의 위치와 이동 조건은 공식 지도에서 확인해 주세요.', '상설전시관 층별 접근성 지도', '국립중앙박물관 접근성 안내', museumAccess),
        fact('toilet', '장애인 화장실', '상설전시관 공식 층별 지도에 장애인 화장실이 표시돼요. 가까운 화장실까지의 이동 조건은 방문 전에 확인해 주세요.', '상설전시관 층별 접근성 지도', '국립중앙박물관 접근성 안내', museumAccess)
      ]
    },
    'tour-750804': {
      arrival: {name: '마장호수 제2주차장 장애인 주차 구역', mapQuery: '마장호수 제2주차장 파주'},
      entrance: {name: '마장호수 데크 산책로 진입부'},
      restroom: {location: '주차장 인근과 마장호수 전망대', sourceUrl: majangAccess},
      map: {
        official: majangAccess,
        linkLabel: '마장호수 공식 무장애 관광지도 열기',
        caption: '제2주차장 주변 보행 통로와 데크 입구의 단차 제거가 공식 안내에 나와 있어요. 정확한 거리와 경사는 공개 자료에서 확인되지 않아요.',
        stops: [
          ['제2주차장', '장애인 주차 구역 2면이 있어요. 주차장 주변에 보행 통로가 조성되어 있어요.'],
          ['데크 진입부', '관광공사 안내에 따르면 데크 산책로 진입부의 단차가 제거됐어요.']
        ]
      },
      facts: [
        fact('dropoff', '장애인 주차', '제2주차장에 장애인 주차 구역 2면이 있어요.', '마장호수 제2주차장', '한국관광공사 열린관광', majangParking),
        fact('entrance', '데크 진입부', '주차장 주변에 보행 통로를 조성하고 데크 진입부의 단차를 제거했다고 안내해요.', '주차장 주변 보행 통로 및 데크 진입부', '한국관광공사 열린관광', majangAccess),
        fact('toilet', '장애인 화장실', '주차장 인근과 전망대에 장애인 화장실이 있어요.', '마장호수 주차장 인근 및 전망대', '한국관광공사 열린관광', majangAccess)
      ]
    },
    'tour-2470006': {
      arrival: {name: 'DDP 지하주차장', mapQuery: '동대문디자인플라자 DDP 주차장'},
      entrance: {name: 'DDP 주출입구 자동문'},
      facts: [
        fact('dropoff', 'DDP 지하주차장', '차량은 을지로45길에서 지하주차장으로 들어갈 수 있어요.', 'DDP 지하주차장 차량 진입로', '서울시 DDP 교통 안내', ddpParking),
        fact('entrance', 'DDP 주출입구', '관광공사 안내에는 단차 없는 자동문과 장애인용 엘리베이터가 표시돼요.', 'DDP 주출입구 및 시설', '한국관광공사 열린관광', ddpAccess),
        fact('toilet', '장애인 화장실 위치 미확인', '장애인 화장실이 안내돼 있어요. 어느 층인지와 이동 경로는 확인이 필요해요.', 'DDP 건물', '한국관광공사 열린관광', ddpAccess)
      ]
    },
    'tour-128611': {
      arrival: {name: '서울숲 주차장', mapQuery: '서울숲 주차장 서울 성동구'},
      entrance: {name: '서울숲 정문'},
      restroom: {location: '서울숲 방문자센터 안내 구역', sourceUrl: forestAccess},
      facts: [
        fact('dropoff', '장애인 주차', '서울숲 주차장에 장애인 주차 구역 6면이 안내돼 있어요.', '서울숲 주차장', '서울숲컨서번시', forestParking),
        fact('entrance', '서울숲 정문', '서울다누림관광은 정문에 계단이나 경사가 없다고 안내해요.', '서울숲 정문', '서울다누림관광', forestAccess),
        fact('toilet', '장애인 화장실', '서울다누림관광은 방문자 안내 구역에 장애인 화장실이 있다고 안내해요.', '서울숲 방문자 안내 구역', '서울다누림관광', forestAccess)
      ]
    }
  };
})();
