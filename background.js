chrome.runtime.onInstalled.addListener(async function(info) {
  if (info.reason == 'install') {
    await reset();
    await pollSources();
  }

  async function matchInstance(url) {
    var instances, i;

    instances = (await browser.storage.local.get('instances')).instances;
    for (i = 0; i != instances.length; i++)
      if (instances[i].url == url.slice(0, instances[i].url.length))
        return instances[i].url;
    return null;
  };

  async function removeInstance(url) {
    var cfg, i;

    cfg = await browser.storage.local.get('instances');
    for (i = 0; i != cfg.instances.length; i++)
      if (cfg.instances[i].url == url.slice(0, cfg.instances[i].url.length)) {
        cfg.instances.splice(i, 1);
        await browser.storage.local.set(cfg);
        return;
      }
  }

  async function currentTab() {
    return (await browser.tabs.query({'active': true, 'currentWindow': true}))[0].url;
  }

  await browser.contextMenus.removeAll();

  await browser.contextMenus.create({
    'id': 'searx-tool-blacklist',
    'title': 'Blacklist Instance',
    'type': 'radio',
    'contexts': [ 'action' ],
    'enabled': false
  });
  await browser.contextMenus.create({
    'id': 'searx-tool-del',
    'title': 'Remove Instance',
    'contexts': [ 'action' ],
    'visible': false
  });
  await browser.contextMenus.create({
    'id': 'searx-tool-add',
    'title': 'Add Instance',
    'contexts': [ 'action' ],
    'visible': false
  });

  browser.contextMenus.onClicked.addListener(async function(info) {
    var cfg, i, url, match;
     if (info.menuItemId == 'searx-tool-add') {
      cfg = await browser.storage.local.get('instances');
      await addInstance(await currentTab(), {}, cfg.instances);
      await browser.storage.local.set(cfg);
    }
    else if (info.menuItemId == 'searx-tool-del')
      await removeInstance(await currentTab());
    else if (info.menuItemId == 'searx-tool-blacklist') {
      cfg = await browser.storage.local.get('instance-blacklist');
      url = await currentTab();
      match = await matchInstance(url);
      if (match)
        url = match;
      i = cfg['instance-blacklist'].indexOf(url);

      if (i == -1)
        cfg['instance-blacklist'].push(url);
      else
        cfg['instance-blacklist'].splice(i, 1);
      await browser.storage.local.set(cfg);
    }

   });
   browser.contextMenus.onShown.addListener(async function (info) {
    var url, matched, onlist;
    if (!info.contexts.includes('action'))
      return;

    url = await currentTab();
    matched = await matchInstance(url);
    onlist = (await browser.storage.local.get('instance-blacklist'))['instance-blacklist'].includes(url);

    if ((await browser.storage.local.get('authoritative')).authoritative)
      if (matched) {
        await browser.contextMenus.update('searx-tool-add', {'visible': false});
        await browser.contextMenus.update('searx-tool-del', {'visible': true});
      }
      else {
        await browser.contextMenus.update('searx-tool-add', {'visible': true});
        await browser.contextMenus.update('searx-tool-del', {'visible': false});
      }

    if (matched) {
      await browser.contextMenus.update('searx-tool-blacklist', {'enabled': true, 'checked': true});
      await browser.contextMenus.update('searx-tool-blacklist', {'enabled': true, 'checked': onlist});
    }
    else {
      await browser.contextMenus.update('searx-tool-blacklist', {'enabled': true, 'checked': false});
      if (onlist)
        await browser.contextMenus.update('searx-tool-blacklist', {'enabled': true, 'checked': true});
      else
        await browser.contextMenus.update('searx-tool-blacklist', {'enabled': false, 'checked': false});
    }
  
    await browser.contextMenus.refresh();
  });

});
