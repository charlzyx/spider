const pptr = require('puppeteer');
const fs = require('fs');
const path = require('path');

const filePath = (startPage, endPage) => path.resolve('./', `${startPage}_${endPage}.csv`);
const logPath = path.resolve('./', `.log`);
const ONEMIN = 1000 * 60;
const BASE = [
  '生产者名称',
  '社会信用代码(身份证号码)',
  '法定代表人(负责人)',
  '住所',
  '生产地址',
  '食品类别',
  '许可证编号',
  '日常监督管理机构',
  '日常监督管理人员',
  '发证机关',
  '签发人',
  '发证日期',
  '有效期至',
  '许可明细',
  // '食品、食品添加剂类别',
  // '类别编号',
  // '类别名称',
  // '品种明细',
  // '备注',
  // '外设仓库地址',
];

const base = [...BASE];
base.pop();

const COLS = [
  'ID',
  ...base,
];

let dIndex = 0;
while (dIndex < 10) {
  COLS.push(`食品、食品添加剂类别 ${dIndex}`),
  COLS.push(`类别编号 ${dIndex}`),
  COLS.push(`类别名称 ${dIndex}`),
  COLS.push(`品种明细 ${dIndex}`),
  COLS.push(`备注 ${dIndex}`),
  dIndex++;
}




const selectors = {
  content: '#content > table:nth-child(4) > tbody > tr > td:nth-child(1)',
  alist: '#content table tr a',
  goInput: '#goInt',
  goBtn: '#content input[src="images/dataanniu_11.gif"]',
  goNext: '#content > table:nth-child(4) > tbody > tr > td:nth-child(5) > img',
  goPrev: '#content > table:nth-child(4) > tbody > tr > td:nth-child(4) > img',
  info: '#content table tr td',
  backBtn: '#content > div > div > table:nth-child(2) > tbody > tr > td',
};
const config = {
  bootTime: null,
  pages: [
    // { fileName, page, startPage, endPage, currentPage, currentIndex },
  ],
  website: 'http://app1.sfda.gov.cn/datasearch/face3/base.jsp?tableId=120&tableName=TABLE120&title=%CA%B3%C6%B7%C9%FA%B2%FA%D0%ED%BF%C9%BB%F1%D6%A4%C6%F3%D2%B5(SC)&bcId=145275419693611287728573704379',
};

const errorHandler = async (e, pageConfig) => {
  const { pageRef, start, end, pageIndex } = pageConfig;
  const info = { page: pageIndex, time: new Date(), message: e.message, stack: e.stack, config: { ...pageConfig, pageRef: null } };
  await fs.appendFileSync(logPath, `${new Date()}--${JSON.stringify(info, null, 2)}\n`);
  // 休息1s再继续
  await pageRef.waitFor(1000);
  return begin(pageRef, pageIndex);
}

const detailParser = (detail) => {
  const cols = detail.split('\n').filter(i => !!i && i.indexOf('外设仓库地址') === -1);
  // '食品、食品添加剂类别',
  // '类别编号',
  // '类别名称',
  // '品种明细',
  // '备注',
  const groups = cols.map(col => col.split('：')[1]);
  return groups;
};

const tableParser = (tds) => {
  // 移除第一行 食品生产许可获证企业(SC)
  tds.splice(0, 1);
  // 移除最后三个 包括 注: 这行和 返回这一行
  tds.splice(tds.length - 4, 3);
  const table = {};
  tds.forEach((td, index) => {
    const isKey = index % 2 === 0;
    if (isKey) {
      table[td] = null;
    } else {
      table[tds[index - 1]] = td;
    }
  });
  const list = BASE.map(key => {
    return table[key];
  });
  const detailList = detailParser(table.许可明细);
  // 清理最后一个生产明细, 被下方代替
  list.pop();
  const all = list.concat(detailList);
  return all;
};

const got = async (a, page, conf) => {
  const { fileName, pageIndex } = conf;
  try {
    const innerText = await a.getProperty('innerText');
    const id = /\d+/.exec(innerText)[0];
    const name = /.+/.exec(innerText)[0].replace(/.+\d+\./, '');
    a.click();
    await page.waitForResponse(resp => /.+\.jsp/.test(resp.url()));
    // 给一点点渲染时间
    await page.waitFor(200);
    const list = await page.$$eval(selectors.info, tds => {
      return tds.map(td => td.innerText.replace('/', '无').replace('\\', '无').replace('"', ''));
    });

    const table = tableParser(list);

    await fs.appendFileSync(fileName, id + ',' + table.join(',') + ',\n', { encoding: 'utf-8' });

    conf.start = config.pages[pageIndex].start = +id + 1;

    console.log(`${new Date()} [${pageIndex}]-${id}---${name}\n`);
    await fs.appendFileSync(logPath, `[${pageIndex}]-${id}---${name}\n`);

    await page.click(selectors.backBtn);
    await page.waitFor(500);

    return true;
  } catch (e) {
    return errorHandler(e, conf);
  }
};

const typePage = async (to, page) => {
  await page.tap(selectors.goInput);
  await page.click(selectors.goInput, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selectors.goInput, `${to}`);
  await page.click(selectors.goBtn);
}

const jumpTo = async (page, index) => {
  try {
    const { start } = config.pages[index];
    const to = Math.ceil(start / 15);
    await typePage(to, page);
    await page.waitForResponse(resp => /.+\.jsp/.test(resp.url()));
    await page.waitFor(300);
  } catch (e) {
    return errorHandler(e, config.pages[index]);
  }
}

const loopAList = async (page, index) => {
  const conf = config.pages[index];

  const list = await page.$$(selectors.alist);
  const len = list.length;
  let i = (conf.start - 1) % 15;

  while (i < len) {
    try {
      const alist = await page.$$(selectors.alist);
      const a = alist[i];
      i++;
      await got(a, page, conf);
    } catch (e) {
      return errorHandler(e, config.pages[index]);
    }
  }

  console.log('-----------', conf.start, '--------', conf.end);
  if (conf.start <= conf.end) {
    try {
      await jumpTo(page, index);
      return loopAList(page, index);
    } catch (e) {
      return errorHandler(e, conf);
    }
  } else {
    return true;
  }
};

const begin = async (page, index) => {
  await page.goto(config.website, { waitUntil: 'networkidle0' });
  await page.waitFor(500);
  await jumpTo(page, index);
  await loopAList(page, index);
};

var boot = async (conf = {}) => {
  config.bootTime = new Date();
  const { startId = 1, endId = 60, tabCount = 1 } = conf;
  const browser = await pptr.launch({ headless: true });
  const pages = [];
  let pageIndex = 0;
  while (pageIndex < tabCount) {
    const page = await browser.newPage();
    page.setViewport({ width: 1280, height: 1400 });
    pages[pageIndex] = page;
    pageIndex++;
  }

  const per = Math.ceil((endId - startId + 1) / tabCount);
  config.pages = pages.map((p, index) => {
    const start = startId + (per * index);
    const end = Math.min(start + per - 1, endId);
    return {
      pageIndex: index,
      pageRef: pages[index],
      fileName: filePath(start, end),
      bootTime: new Date(),
      start,
      end,
    }
  });
  config.pages.forEach((p) => {
    fs.writeFileSync(p.fileName, COLS.join(',') + ',\n', { encoding: 'utf-8' })
  });

  await Promise.all(pages.map((page, index) => begin(page, index)));
  console.log('-------------------------------------');
  console.log('ALL DONE!');
  console.log(`--${config.bootTime}--${new Date().toString()}--`);
  console.log(`--${(+new Date() - +new Date(config.bootTime)) / ONEMIN} min----`);
  console.log('-------------------------------------');
  browser.close();
  process.exit();
}

boot();
