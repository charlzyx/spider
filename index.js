const pptr = require('puppeteer');
const fs = require('fs');
const path = require('path');

const filePath = (startPage, endPage) => path.resolve('./', `${startPage}_${endPage}.csv`);
const logPath = path.resolve('./', `.log`);
const ONEMIN = 1000 * 60;


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
  const { pageRef, lastPage, currentPage, index } = pageConfig;
  const info = { page: index, time: new Date(), message: e.message, stack: e.stack, config: { ...pageConfig, pageRef: null } };
  await fs.appendFileSync(logPath, `${new Date()}--${JSON.stringify(info, null, 2)}\n`);
  pageConfig.currentPage = lastPage || currentPage;
  // 休息1s再继续
  await pageRef.waitFor(1000);
  return begin(pageRef, pageConfig);
}



const pageParser = async (page) => {
  // 第 1 页 共10508页 共157614条
  const info = await page.$eval(selectors.content, el => el.innerText);
  const pageSize = 15;
  const pageNo = /\d+/.exec(/第\s?\d+\s?页/.exec(info)[0]);
  const pageCount = /\d+/.exec(/共\s?\d+\s?页/.exec(info)[0]);
  const dataCount = /\d+/.exec(/共\s?\d+\s?条/.exec(info)[0]);
  return { pageSize, pageNo, pageCount, dataCount };
}

const got = async (a, page, conf) => {
  const { fileName, index } = conf;
  try {
    const innerText = await a.getProperty('innerText');
    const id = /\d+/.exec(innerText)[0];
    const name = /.+/.exec(innerText)[0].replace(/.+\d+\./, '');
    a.click();
    await page.waitForResponse(resp => /.+\.jsp/.test(resp.url()));
    // 给一点点渲染时间
    await page.waitFor(200);
    const info = await page.$$eval(selectors.info, tds => {
      return tds.map(td => td.innerText.replace(/\,/g, '__comma__').replace(/\n/g, '__enter__'));
    });
    info.unshift(id);
    await fs.appendFileSync(fileName, info.join(','), { encoding: 'utf-8' });
    await fs.appendFileSync(fileName, '\n', { encoding: 'utf-8' });
    console.log(`${new Date()} [${index}]-${id}---${name}\n`);
    await fs.appendFileSync(logPath, `[${index}]-${id}---${name}\n`);
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

const jumpTo = async (page, conf) => {
  try {
    const { currentPage } = conf;
    await typePage(currentPage, page);
    await page.waitForResponse(resp => /.+\.jsp/.test(resp.url()));
    await page.waitFor(300);
  } catch (e) {
    return errorHandler(e, conf);
  }
}

const loopAList = async (page, conf) => {
  const { startPage, endPage, currentPage, lastPage, lastIndex, index } = conf;

  const list = await page.$$(selectors.alist);

  const len = list.length;
  let i = lastIndex || 0;

  while (i < len) {
    const alist = await page.$$(selectors.alist);

    await got(alist[i], page, conf);

    conf.lastIndex = i;
    i++;
  }

  conf.lastIndex = 0;
  conf.currentPage = currentPage + 1;
  conf.lastPage = currentPage;

  config.pages[index] = conf;

  if (conf.currentPage <= endPage) {
    try {
      await jumpTo(page, conf);
      return loopAList(page, conf);
    } catch (e) {
      return errorHandler(e, conf);
    }
  } else {
    return true;
  }
};

const begin = async (page, conf) => {
  await page.goto(config.website, { waitUntil: 'networkidle0' });
  await page.waitFor(500);
  await jumpTo(page, conf);
  await loopAList(page, conf);
};

var boot = async (conf = {}) => {
  config.bootTime = new Date();
  const { startPage = 1, endPage = 10, tabCount = 3 } = conf;
  const browser = await pptr.launch({ headless: true });
  const pages = [];
  let pageIndex = 0;
  while (pageIndex < tabCount) {
    const page = await browser.newPage();
    page.setViewport({ width: 1280, height: 1400 });
    pages[pageIndex] = page;
    pageIndex++;
  }

  const per = Math.ceil((endPage - startPage + 1) / tabCount);
  const pagesConfig = config.pages = pages.map((p, index) => {
    const start = startPage + per * index;
    const end = Math.min(startPage + per * (index + 1) - 1, endPage);
    return {
      index,
      fileName: filePath(start, end),
      pageRef: pages[index],
      bootTime: new Date().toLocaleString(),
      startPage: start,
      endPage: end,
      currentPage: start,
    }
  });

  await Promise.all(pages.map((page, index) => begin(page, pagesConfig[index])));
  console.log('-------------------------------------');
  console.log('ALL DONE!');
  console.log(`--${config.bootTime}--${new Date().toString()}--`);
  console.log(`--${(+new Date() - +new Date(config.bootTime)) / ONEMIN} min----`);
  console.log('-------------------------------------');
  browser.close();
  process.exit();
}

boot();
