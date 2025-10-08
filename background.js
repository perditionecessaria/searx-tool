import { addInstance, reset, pollSources } from '/searx-tool.js';

async function matchInstance(url) {
  var instances, i;

  instances = (await chrome.storage.local.get('instances')).instances;
  for (i = 0; i != instances.length; i++)
    if (instances[i].url == url.slice(0, instances[i].url.length))
      return instances[i].url;
  return null;
}

async function removeInstance(url) {
  var cfg, i;

  cfg = await chrome.storage.local.get('instances');
  for (i = 0; i != cfg.instances.length; i++)
    if (cfg.instances[i].url == url.slice(0, cfg.instances[i].url.length)) {
      cfg.instances.splice(i, 1);
      await chrome.storage.local.set(cfg);
      return;
    }
}

async function currentTab() {
  return (await chrome.tabs.query({'active': true, 'currentWindow': true}))[0].url;
}


var chromeCompatibility;

chromeCompatibility = typeof browser == 'undefined';
chrome.storage.session.set({'chrome-compatibility': chromeCompatibility});

chrome.runtime.onInstalled.addListener(async function(info) {
    if (info.reason == 'install') {
      await reset();
      await pollSources();
    }

  await chrome.contextMenus.removeAll();

  if ((await chrome.storage.session.get('chrome-compatibility'))['chrome-compatibility']) {
    await chrome.contextMenus.create({
      'id': 'searx-tool-add',
      'title': 'Add Instance',
      'contexts': [ 'action' ],
    });
    await chrome.contextMenus.create({
      'id': 'searx-tool-del',
      'title': 'Remove Instance',
      'contexts': [ 'action' ],
    });
    await chrome.contextMenus.create({
      'id': 'searx-tool-blacklist',
      'title': 'Blacklist Instance',
      'contexts': [ 'action' ],
    });
    await chrome.contextMenus.create({
      'id': 'searx-tool-unblacklist',
      'title': 'Unblacklist Instance',
      'contexts': [ 'action' ],
    });
  }
  else {
    await chrome.contextMenus.create({
      'id': 'searx-tool-blacklist',
      'title': 'Blacklist Instance',
      'type': 'radio',
      'contexts': [ 'action' ],
      'enabled': false
    });
    await chrome.contextMenus.create({
      'id': 'searx-tool-del',
      'title': 'Remove Instance',
      'contexts': [ 'action' ],
      'visible': false
    });
    await chrome.contextMenus.create({
      'id': 'searx-tool-add',
      'title': 'Add Instance',
      'contexts': [ 'action' ],
      'visible': false
    });
  }
});

chrome.contextMenus.onClicked.addListener(async function(info) {
  var cfg, i, url, match;
  if (info.menuItemId == 'searx-tool-add') {
    cfg = await chrome.storage.local.get('instances');
    await addInstance(await currentTab(), {}, cfg.instances);
    await chrome.storage.local.set(cfg);
  }
  else if (info.menuItemId == 'searx-tool-del')
    await removeInstance(await currentTab());
  else if ((await chrome.storage.session.get('chrome-compatibility'))['chrome-compatibility']) {
    if (info.menuItemId == 'searx-tool-blacklist') {
      cfg = await chrome.storage.local.get('instance-blacklist');
      url = await currentTab();
      match = await matchInstance(url);
      if (match)
        url = match;
      i = cfg['instance-blacklist'].indexOf(url);

      if (i == -1) {
        cfg['instance-blacklist'].push(url);
        await chrome.storage.local.set(cfg);
      }
    }
    else if (info.menuItemId == 'searx-tool-unblacklist') {
      cfg = await chrome.storage.local.get('instance-blacklist');
      url = await currentTab();
      match = await matchInstance(url);
      if (match)
        url = match;
      i = cfg['instance-blacklist'].indexOf(url);

      if (i != -1) {
        cfg['instance-blacklist'].splice(i, 1);
        await chrome.storage.local.set(cfg);
      }
    }
  }
  else if (info.menuItemId == 'searx-tool-blacklist') {
    cfg = await chrome.storage.local.get('instance-blacklist');
    url = await currentTab();
    match = await matchInstance(url);
    if (match)
      url = match;
    i = cfg['instance-blacklist'].indexOf(url);

    if (i == -1)
      cfg['instance-blacklist'].push(url);
    else
      cfg['instance-blacklist'].splice(i, 1);
    await chrome.storage.local.set(cfg);
  }
});

if (!chromeCompatibility)
  chrome.contextMenus.onShown.addListener(async function (info) {
    var url, matched, onlist;
    if (!info.contexts.includes('action'))
      return;

    url = await currentTab();
    matched = await matchInstance(url);
    onlist = (await chrome.storage.local.get('instance-blacklist'))['instance-blacklist'].includes(url);

    if ((await chrome.storage.local.get('authoritative')).authoritative)
      if (matched) {
        await chrome.contextMenus.update('searx-tool-add', {'visible': false});
        await chrome.contextMenus.update('searx-tool-del', {'visible': true});
      }
      else {
        await chrome.contextMenus.update('searx-tool-add', {'visible': true});
        await chrome.contextMenus.update('searx-tool-del', {'visible': false});
      }

    if (matched) {
      await chrome.contextMenus.update('searx-tool-blacklist', {'enabled': true, 'checked': true});
      await chrome.contextMenus.update('searx-tool-blacklist', {'enabled': true, 'checked': onlist});
    }
    else {
      await chrome.contextMenus.update('searx-tool-blacklist', {'enabled': true, 'checked': false});
      if (onlist)
        await chrome.contextMenus.update('searx-tool-blacklist', {'enabled': true, 'checked': true});
      else
        await chrome.contextMenus.update('searx-tool-blacklist', {'enabled': false, 'checked': false});
    }

    await chrome.contextMenus.refresh();
  });
