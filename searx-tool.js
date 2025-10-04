function computeHealth(data) {
  if (data.hasOwnProperty('uptime') && data.uptime)
    return data.timing.initial.all.value
           * (200 - data.timing.initial.success_percentage)
           * (200 - data.uptime.uptimeYear) / 10000;
  else if (data.hasOwnProperty('timing') && data.timing)
    return data.timing.initial.all.value
           * (200 - data.timing.initial.success_percentage)
           / 5000;
  else
    return 1;
}

function addInstance(url, data, instances) {
  var i, node;

  node = {
    'url': url,
    'health': computeHealth(data),
    'network': data.network_type
  };

  for (i = 0; i != instances.length; i++)
    if (instances[i].url == url) {
      instances[i] = node;
      return;
    }
  instances.push(node);
}

function mergeSource(source, data, accept, instances) {
  var key;

  if (!data.instances) {
    console.error("Received malformed data from "
                + source.name + " (" + source.url + ").");
    return;
  }

  for (key in data.instances)
    if (data.instances.hasOwnProperty(key)
        && accept(data.instances[key]))
      addInstance(key, data.instances[key], instances);

  source.timestamp = data.timestamp;
}

function syncSource(source, accept, instances) {
  var req, data;

  req = new XMLHttpRequest();
  req.onload = function() {
    if (this.status == 0) {
      console.error("Network error while syncing with "
                    + source.name + " (" + source.url + ").");
    }
    else if (this.status != 200) {
      console.error(this.status + " " + this.responseText + " response while syncing with "
                    + source.name + " (" + source.url + ").");
    }
    else {
      if (this.responseType == 'json')
        data = this.response;
      else if (this.responseType == '' || this.responseType == 'text') {
        try {
          data = JSON.parse(this.response);
        }
        catch (e) {
          console.error(e.name + ": " + e.message + " while syncing with "
                      + source.name +  " (" + source.url + ").");
        }
      }
      else {
        console.error("Received invalid response of type " + this.responseType + " while syncing with "
                    + source.name +  " (" + source.url + ").");
      }

      if (source.timestamp == data.metadata.timestamp)
        console.log("Instance list from " + source.name +  " (" + source.url + ") is already up-to-date.");
      else {
        console.log("Got most recent instance list from " + source.name +  " (" + source.url + ").");
        mergeSource(source, data, accept, instances);
      }
    }
  };
  req.open('GET', source.url, false);
  req.send();
}

async function needSync(src) {
  var i;

  i = (await chrome.storage.local.get('polling-interval'))['polling-interval'];
  return i * 1000
         < Date.now() - src['last-sync'];
}

async function pollSources(dosync) {
  var cfg, accept, dirty;

  cfg = await chrome.storage.local.get([
    'authoritative', 'sources', 'instances', 'instance-blacklist'
  ]);
  accept = function(url) {
    return !cfg['instance-blacklist'].includes(url);
  };

  if (!dosync && !cfg.authoritative) {
    for (i = 0; i != cfg.sources.length && !await needSync(cfg.sources[i]); i++);
    if (i == cfg.sources.length)
      return;
    cfg.instances = [];
  }

  dirty = false;
  for (i = 0; i != cfg.sources.length; i++)
    if (dosync || !cfg.authoritative
        || await needSync(cfg.sources[i])) {
      syncSource(cfg.sources[i], accept, cfg.instances);
      cfg.sources[i]['last-sync'] = Date.now();
      dirty = true;
    }

  if (dirty) {
    await chrome.storage.local.set({'instances': cfg.instances,
                                     'sources': cfg.sources});
  }
}

async function reset() {
  await chrome.storage.local.clear();
  await chrome.storage.local.set({
    'polling-interval': 604800, /* weekly */
    'sources': [ { 'name': 'searx-space',
                   'url': 'https://searx.space/data/instances.json',
                   'timestamp': '',
                   'last-sync': 0 } ],
    'instances': [],
    'instance-blacklist': [],
    'method': 'round-robin', /* one of 'round-robin', 'random', 'best' */
    'network': 'normal', /* one of 'any', 'normal', 'tor' */
    'authoritative': false, /* update policy */
    'last-instance': ''
  });
}

async function searxTool(string) {
  var cfg, found, array, accept, i, n;

  pollSources();

  /* wait for first sync */
  for (;;) {
    cfg = await chrome.storage.local.get([
      'instances', 'method', 'network', 'last-instance', 'instance-blacklist'
    ]);
    if (cfg.instances.length != undefined && cfg.instances.length != 0)
      break;
    await new Promise(function (resolv) { /* sleep(100) */
      setTimeout(resolv, 100);
    });
  }

  accept = function(instance) {
    return cfg.network == 'any' || instance.network == cfg.network;
  };

  if (cfg.method == 'round-robin') {
    for (n = 0; n != cfg.instances.length && cfg.instances[n].url != cfg['last-instance']; n++);
    if (n == cfg.instances.length) {
      for (i = 0; i != cfg.instances.length && !accept(cfg.instances[i]); i++)
      if (i == cfg.instances.length) {
        console.error('No instance found under given constraints.');
        return;
      }
      found = cfg.instances[i];
    }
    else {
      if (n == cfg.instances.length-1)
        i = 0;
      else
        i = n+1;
      while(!accept(cfg.instances[i]) && i != n)
        if (++i == cfg.instances.length)
          i = 0;
      found = cfg.instances[i];
    }
    chrome.storage.local.set({'last-instance': found.url});
  }
  else if (cfg.method == 'random') {
    array = new Uint32Array(1);
    do {
      window.crypto.getRandomValues(array); /* traffic obfuscation is serious business */
      found = cfg.instances[Math.floor(cfg.instances.length * array[0] / 2**32)];
    } while (!accept(found));
  }
  else { /* use 'best' as a fallback */
    for (i = 0; !accept(cfg.instances[i]); i++);
    if (i == cfg.instances.length) {
      console.error('No instance found under given constraints.');
      return;
    }

    for (found = cfg.instances[i++]; i != cfg.instances.length; i++)
      if (cfg.instances[i].health < found.health
          && accept(cfg.instances[i]))
      found = cfg.instances[i];
  }

  url = new URL(found.url);
  if (url.pathname.charAt(url.pathname.length-1) != '/')
    url.pathname += '/';
  url.pathname += 'search';
  url.searchParams.append('q', string);
  return url.toString();
}
