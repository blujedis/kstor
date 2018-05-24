import { KStor, IMap } from './';

const options = {
  name: '.queryrc',
  dir: './.tmp',
  // superkey: 'apps',
  // encryptionKey: 'james-comey-is-a-liar'
  // encryptionKey: 'eurmmruuemme7738mfmmfqwerxasfrml'
  transform: (k, v) => {
    for (const key in v) {
      const val = v[key].established;
      if (!(val instanceof Date))
        v[key].established = new Date(v[key].established);
    }
    return v;
  }
};

const defaults = {
  blogs: {
    nba: { name: 'NBA Blog', teams: 30, established: new Date('08/20/1920'), active: true },
    nfl: { name: 'NFL Blog', teams: 32, established: new Date('06/06/1946'), days: ['sunday', 'monday', 'thursday', 'saturday'] },
    mlb: { name: 'MLB Blog', teams: 31, established: new Date('01/01/1869'), active: false }
  }
};


const store = new KStor(options, defaults);

// const n = store.queryNormalize({
//   $and: [
//     { price: { $gt: 100 } },
//     { price: { $lt: 300 } },
//     { $or: [{ active: { $eq: true } }] }
//   ]
// });


const result = store.query('blogs', { $and: [{ teams: { $gt: 30 } }, { teams: { $lt: 32 } }] });


store.clear();




