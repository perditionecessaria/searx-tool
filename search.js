import { reset, mergeSource, pollSources, searxTool } from '/searx-tool.js';

async function search(query) {
  window.location = await searxTool(query);
}

var q;

q = (new URLSearchParams(window.location)).get('q');
if (q && q.length != 0)
  search(q);

if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
  document.getElementById('banner').src = '/icon/the-eye.png';
}

window.onload = function() {
  document.getElementById('search-submit').onclick = function() {
    search(document.getElementById('search-entry').value);
  };

  document.getElementById('preferences').onclick = function() {
    async function updateAll() {
      var cfg;

      cfg = await chrome.storage.local.get(null);
      document.getElementById('polling-interval').value = cfg['polling-interval'];
      document.getElementById('method').value = cfg.method;
      document.getElementById('network').value = cfg.network;
      document.getElementById('authoritative').checked = cfg.authoritative;
      document.getElementById('config-entry').innerText = JSON.stringify(cfg);
    }
    function importFile(callback) {
      var file;
      file = document.createElement('input');
      file.type = 'file';
      file.onchange = function(iev) {
        var read;
        read = new FileReader();
        read.readAsText(iev.target.files[0], 'UTF-8');
        read.onload = function(ev) {
           callback(ev.target.result, iev.target.files[0].name);
        };
      };
      file.click();
    }
    function exportFile(name, data) {
      var a;
      a = document.createElement('a');
      a.download = name;;
      a.href = window.URL.createObjectURL(
        new Blob([data], {'type': 'application/json'})
      );
      a.click();
    }

    chrome.storage.onChanged.addListener(updateAll);

    var p, sav;
    sav = document.body;
    p = document.createElement('body');
    p.innerHTML
     = "<nav><button id='close'>Preferences</button></nav>\
        <ul>\
        <li>\
        <label>Update Interval</label>\
        <input type='number' id='polling-interval'></input>\
        </li>\
        <li>\
        <label>Instance Selection Method</label>\
        <select id='method'>\
        <option value='round-robin'>Round Robin</option>\
        <option value='random'>Random</option>\
        <option value='best'>Best Instance</option>\
        </select>\
        </li>\
        <li>\
        <label>Instance Networks</label>\
        <select id='network'>\
        <option value='any'>Any Network</option>\
        <option value='normal'>Normal (Clearnet)</option>\
        <option value='tor'>TOR</option>\
        </select>\
        </li>\
        <li>\
        <label>Authoritative:</label>\
        <input type='checkbox' id='authoritative'></input>\
        <label>Preserve the local index and allow manually adding instances; Otherwise every update overwrites the instance list.</label>\
        </li>\
        <li>\
        <label>Full Configuration:</label>\
        <br>\
        <div contenteditable id='config-entry' class='entry'></div>\
        <p id='config-error'></p>\
        <br>\
        <button id='config-submit'>Save</button>\
        <button id='config-reset'>Reset</button>\
        <button id='config-import'>Import</button>\
        <button id='config-export'>Export</button>\
        </li>\
        <li>\
        <label>Utilities</label>\
        <button id='util-sync'>Sync</button>\
        <button id='util-import'>Import Instances</button>\
        <button id='util-export'>Export Instances</button>\
        <p id='util-error'></p>\
        </li>\
        </ul>";

    document.body = p;
    updateAll();

    document.getElementById('close').onclick = function() {
      document.body = sav;
    };
    document.getElementById('polling-interval').onchange = function() {
      chrome.storage.local.set({'polling-interval': event.target.value});
    };
    document.getElementById('method').onchange = function() {
      chrome.storage.local.set({'method': event.target.value});
    };
    document.getElementById('network').onchange = function() {
      chrome.storage.local.set({'network': event.target.value});
    };
    document.getElementById('authoritative').onclick = function() {
      chrome.storage.local.set({'authoritative': event.target.checked});
    };
    document.getElementById('config-submit').onclick = async function() {
      var obj;
      try {
        obj = JSON.parse(document.getElementById('config-entry').innerText);
        await reset();
        await chrome.storage.local.set(obj);
        document.getElementById('config-error').innerText = 'Saved.';
      }
      catch(e) {
        document.getElementById('config-error').innerText
         = e.name + ": " + e.message;
      }
    };
    document.getElementById('config-reset').onclick = function() {
      reset().then(async function() {
        document.getElementById('config-error').innerText = 'Configuration Reset; Syncing...';
        await pollSources();
        document.getElementById('config-error').innerText = 'Completed First Sync.';
      });
    };
    document.getElementById('config-import').onclick = function() {
      importFile(function(v) {
        document.getElementById('config-entry').innerText = v;
      });
    };
    document.getElementById('config-export').onclick = function() {
      chrome.storage.local.get(null, function(v) {
        exportFile('searx-tool.json', JSON.stringify(v));
      });
    };
    document.getElementById('util-sync').onclick = async function() {
      document.getElementById('util-error').innerText = 'Syncing...';
      await pollSources(true);
      document.getElementById('util-error').innerText = 'Completed Sync.';
    };
    document.getElementById('util-import').onclick = function() {
      chrome.storage.local.get(['instances', 'instance-blacklist'], function(v) {
        importFile(function(w, name) {
          var source, data, accept;

          source = {
           'name': 'user',
           'url': name
          };
          accept = function(w) {
            return !v['instance-blacklist'].includes(w);
          }
          
          try {
            data = JSON.parse(w);
            mergeSource(source, data, accept, v.instances);
            chrome.storage.local.set({'instances': v.instances}, function() {
              document.getElementById('util-error').innerText = 'Imported Instances.';
            });
          }
          catch (e) {
            document.getElementById('util-error').innerText
             = e.name + ": " + e.message;
          }
        });
      });
    };
    document.getElementById('util-export').onclick = async function() {
      chrome.storage.local.get('instances', function(v) {
        var i, instances;

        instances = {};
        for (i = 0; i != v.instances.length; i++)
          instances[v.instances[i].url] = {
           'network_type': v.instances[i].network,
          };

        exportFile('instances.json', JSON.stringify({
          'metadata' : { 'timestamp': Date.now() },
          'instances': instances
        }));
        document.getElementById('util-error').innerText = 'Exported Instances.';
      });
    };
  };
};
