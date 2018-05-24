import * as chai from 'chai';
import * as mocha from 'mocha';
import { KStor } from './';
import { homedir } from 'os';

const expect = chai.expect;
const should = chai.should;
const assert = chai.assert;

const options = {
  dir: './.tmp'
};

const defaults = {
  name: 'app',
  version: '1.0.1',
  description: 'some description.',
  subapps: {
    subapp1: { name: 'subapp1', version: '2.0.1', description: 'sub app one', tags: ['orange', 'apple', 'banana'] },
    subapp2: { name: 'subapp2', version: '3.0.1', description: 'sub app two' }
  }
};

const options2 = {
  dir: './.tmp',
  entrypoint: 'apps',
  encryptionKey: 'james-comey-is-a-liar',
  transform: (k, v) => {
    for (const key in v) {
      if (key === 'date' && !(v[key] instanceof Date))
        v[key] = new Date(v[key]);
    }
    return v;
  }
};

const defaults2 = {
  apps: {
    blog1: { name: 'My Blog', date: '06/04/1776' },
    blog2: { name: 'Other Blog', date: '12/14/1799' }
  }
};

const store = new KStor<any>('test1', defaults, options);
const store2 = new KStor<any>('test2', defaults2, options2);

const clone = (v) => JSON.parse(JSON.stringify(v));

describe('KStor', () => {

  before((done) => {
    done();
  });

  // TEST INIT //

  it('should get generated save paths.', () => {
    assert.equal(store['getPath'](options), '.tmp/test1.json');
    assert.equal(store['getPath'](), `${homedir()}/.kstor/kstor/config.json`);
    assert.equal(store['getPath']({ name: 'custom' }), `${homedir()}/.kstor/kstor/custom.json`);
    assert.equal(store['getPath']({ name: 'custom', dir: '/absolute/path' }), `/absolute/path/custom.json`);
    assert.equal(store['getPath']({ name: 'with-ext.rc', dir: '/absolute/path' }), `/absolute/path/with-ext.rc`);
    assert.equal(store['getPath']({ name: 'somedir/withdir.json', dir: '/absolute/path' }), `/absolute/path/somedir/withdir.json`);
    assert.equal(store['getPath']({ name: 'somedir/withdir.json' }), `${homedir()}/.kstor/somedir/withdir.json`);
  });

  // STORE //

  it('should equal store DEFAULTS.', () => {
    assert.deepEqual(store.db, defaults);
  });

  it('should check if HAS SUBAPP2 property.', () => {
    assert.isTrue(store.has('subapps.subapp2'));
  });

  it('should GET description.', () => {
    assert.equal(store.get('description'), 'some description.');
  });

  it('should SET description.', () => {
    const desc =
      store.set('description', 'My new description.')
        .get('description');
    assert.equal(desc, 'My new description.');
  });

  it('should DELETE subapp2.', () => {
    const hasApp =
      store.del('subapps.subapp2')
        .has('subapps.subapp2');
    assert.isFalse(hasApp);
  });

  it('should SET using an object.', () => {
    store.set({
      name: 'app',
      version: '1.0.2',
      description: 'My new description.',
    });
    assert.equal(store.get('version'), '1.0.2');
  });

  it('should get SNAPSHOT of data.', () => {
    const snap = store.snapshot();
    delete snap.description;
    assert.isUndefined(snap.description);
    assert.equal(defaults.description, 'some description.');
  });

  it('should listen for DELETED event then callback.', (done) => {
    store.on('deleted', (val) => {
      assert.equal(val, 'My new description.');
      store.removeAllListeners();
      store.set('description', 'My new description.');
      done();
    });
    store.del('description');
  });

  it('should listen for CHANGED event then callback.', (done) => {
    store.on('changed', (val) => {
      assert.equal(val, 'Changed description.');
      store.removeAllListeners();
      done();
    });
    store.set('description', 'Changed description.');
  });

  it('should listen for DESCRIPTION CHANGED event then callback.', (done) => {
    store.on('description', (val) => {
      assert.equal(val, 'Watch description.');
      store.removeAllListeners();
      done();
    });
    store.set('description', 'Watch description.');
  });

  it('should listen for PERSISTED event then callback.', (done) => {
    store.on('persisted', (val) => {
      assert.equal(val.description, 'Persisted description.');
      store.removeAllListeners();
      done();
    });
    store.set('description', 'Persisted description.');
  });

  // ts-node doesn't handle this
  // well need to dig into it.
  // iterator is working.

  // it('should SIZE from iterable.', () => {
  //   assert.equal(store.size, 4);
  // });

  // STORE 2 //

  it('should equal store DEFAULTS.', () => {
    assert.deepEqual(store2.db, defaults2);
  });

  it('should check if HAS BLOG1 property.', () => {
    assert.isTrue(store2.has('blog1'));
  });

  it('should GET blog name.', () => {
    assert.equal(store2.get('blog1.name'), 'My Blog');
  });

  it('should SET blog url.', () => {
    const url =
      store2.set('blog1.url', 'www.myblog.org')
        .get('blog1.url');
    assert.equal(url, 'www.myblog.org');
  });

  it('should DELETE subapp2.', () => {
    const hasUrl =
      store2.del('blog1.url')
        .has('blog1.url');
    assert.isFalse(hasUrl);
  });

  // QUERY TESTS //

  // TODO: Remove query feature until 1.2.0

  // it('should QUERY data from ALL rows in store.', () => {
  //   const expected = {
  //     blog1: { name: 'My Blog', date: new Date('1776-06-04T07:00:00.000Z') },
  //     blog2: { name: 'Other Blog', date: new Date('1799-12-14T08:00:00.000Z') }
  //   };
  //   const result = store2.query('*');
  //   assert.deepEqual(result, expected);
  // });

  // it('should QUERY rows where DATE is greater than 01/01/1778.', () => {
  //   const expected = {
  //     blog2: { name: 'Other Blog', date: new Date('1799-12-14T08:00:00.000Z') }
  //   };
  //   const result = store2.query('*', { date: { $gt: new Date('01/01/1778') } });
  //   assert.deepEqual(result, expected);
  // });

  // it('should QUERY rows where NAME is LIKE "My".', () => {
  //   const expected = {
  //     blog1: { name: 'My Blog', date: new Date('1776-06-04T07:00:00.000Z') },
  //   };
  //   const result = store2.query('*', { name: { $like: 'my' } });
  //   assert.deepEqual(result, expected);
  // });

  // it('should QUERY row at path BLOG2.', () => {
  //   const expected = { name: 'Other Blog', date: new Date('1799-12-14T08:00:00.000Z') };
  //   const result = store2.query('blog2');
  //   assert.deepEqual(result, expected);
  // });

  // it('should QUERY row where TAGS array contains "two".', () => {
  //   const expected = {
  //     blog1: { name: 'My Blog', date: new Date('1776-06-04T07:00:00.000Z'), tags: ['one', 'two', 'three'] },
  //   };
  //   store2.set('blog1.tags', ['one', 'two', 'three']);
  //   const result = store2.query('*', { tags: { $in: ['two', 'four'] } });
  //   assert.deepEqual(result, expected);
  // });

  // it('should QUERY row where TAGS array does not contain "five".', () => {
  //   const expected = {
  //     blog1: { name: 'My Blog', date: new Date('1776-06-04T07:00:00.000Z'), tags: ['one', 'two', 'three'] },
  //   };
  //   store2.set('blog1.tags', ['one', 'two', 'three']);
  //   const result = store2.query('*', { tags: { $nin: 'five' } });
  //   assert.deepEqual(result, expected);
  // });

  after((done) => {
    store.clear();
    store2.clear();
    done();
  });


});