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
  fileName: null,
  bootTime: new Date().toString(),
  rebootTime: null,
  browser: null,
  page: null,
  website: 'http://app1.sfda.gov.cn/datasearch/face3/base.jsp?tableId=120&tableName=TABLE120&title=%CA%B3%C6%B7%C9%FA%B2%FA%D0%ED%BF%C9%BB%F1%D6%A4%C6%F3%D2%B5(SC)&bcId=145275419693611287728573704379',
  // 开始页码
  startPage: 1,
  // 当前页码
  currentPage: 1,
  // 当前正在处理的列
  currentIndex: 0,
  // 结束页码
  endPage: 100,
};

const errorHandler = async (e) => {
  if (config.page) {
    await config.page.close();
  }
  if (config.browser) {
    await config.browser.close();
  }
  const data = { message: e.message, stack: e.stack, time: new Date().toString() };
  fs.appendFile(logPath, JSON.stringify(data, null, 2), { encoding: 'utf-8' }, (error) => { });
  console.log('-------------------------------------');
  console.log('出错啦!正在自动重启...');
  console.log(`--当前时间:${new Date().toString()}----`);
  console.log(`--:${config.startPage}:${config.startPage}:${config.endPage}----`);
  console.log(`--下一页:${config.currentPage}----`);
  console.log(`--正在处理列:${config.currentIndex}----`);
  console.log(`--结束页:${config.endPage}----`);
  console.log('-------------------------------------');
  boot(config.startPage, config.endPage, config.currentPage)
}

const typePage = async (to, page) => {
  await page.tap(selectors.goInput);
  await page.click(selectors.goInput, { clickCount: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selectors.goInput, `${to}`);
  await page.click(selectors.goBtn);
}
/**
 * 从1开始
 */
const jumpTo = async (to, page) => {
  await typePage(to, page);
  await page.waitForResponse(resp => /.+\.jsp/.test(resp.url()));
  await page.waitFor(200);
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

const feeder = async (a, page) => {
  try {
    const innerText = await a.getProperty('innerText');
    const id = /\d+/.exec(innerText)[0];
    const name = /.+/.exec(innerText)[0].replace(/.+\d+\./, '');
    a.click();
    await page.waitForResponse(resp => /.+\.jsp/.test(resp.url()));
    // 给一点点渲染时间
    await page.waitFor(200);
    const info = await page.$$eval(selectors.info, tds => {
      return tds.map(td => td.innerText.replace(/\,/g, '__comma__').replace(/\n/g, ';;;'));
    });
    info.unshift(id);
    await fs.appendFileSync(config.fileName, info.join(','), { encoding: 'utf-8' });
    await fs.appendFileSync(config.fileName, '\n', { encoding: 'utf-8' });
    console.log(`${id}---${name}`);
    await page.click(selectors.backBtn);
    await page.waitFor(500);
    return true;
  } catch (e) {
    errorHandler(e);
  }
};

const loopAList = async (page, startPage, endPage) => {
  const list = await page.$$(selectors.alist);
  const len = list.length;
  let index = config.currentIndex;
  while (index < len) {
    const alist = await page.$$(selectors.alist);
    await feeder(alist[index], page);
    config.currentIndex = index;
    index++;
  }
  config.currentIndex = 0;
  config.currentPage++;
  if (config.currentPage <= endPage) {
    await jumpTo(config.currentPage, page);
    console.log('-------------------------------------');
    console.log(`--启动时间:${config.bootTime}----`);
    console.log(`--当前时间:${new Date().toString()}----`);
    console.log(`--${config.currentPage}-${config.endPage}---`);
    console.log('-------------------------------------');
    return loopAList(page, startPage, endPage);
  } else {
    return true;
  }
};

var boot = async (startPage = 1, endPage = 10, currentPage) => {
  if (!currentPage) {
    config.fileName = filePath(startPage, endPage);
  }
  console.log('-------------------------------------');
  console.log('- spider start! powered by puppeteer-');
  console.log('-------------------------------------');
  config.rebootTime = new Date().toString();
  config.startPage = currentPage || startPage;
  config.currentPage = currentPage || startPage;
  config.endPage = endPage;
  const browser = config.browser = await pptr.launch({ headless: false });
  const page = config.page = await browser.newPage();
  page.setViewport({ width: 1280, height: 1400 });
  await page.goto(config.website, { waitUntil: 'networkidle0' });
  await jumpTo(config.startPage, page);
  const { pageSize, pageNo, pageCount, dataCount } = await pageParser(page);
  await loopAList(page, config.startPage, config.endPage);
  await config.page.close();
  await config.browser.close();
  console.log('-------------------------------------');
  console.log('ALL DONE!');
  console.log(`--启动时间:${config.bootTime}----`);
  console.log(`--当前时间:${new Date().toString()}----`);
  console.log(`--花费时间:${(+new Date() - +new Date(config.bootTime)) / ONEMIN}分钟----`);
  console.log('-------------------------------------');
};

boot();
