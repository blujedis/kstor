# Kstor

Key value store for configs or simple local databases. Includes file encryption as a deterent to users modifying your config.

## Install

```sh
$ npm install kstor
```

## Usage

Using ES6

```ts
import { KStor } from 'kstor';
const defaults = {
  name: 'app',
  description: 'My application description.',
  version: '1.0.0',
  keywords: [
    'todos',
    'notes',
    'messages'
  ],
  author: {
    name: 'Milton Waddams',
    email: 'mwaddams@mail.com'
  }
};
const store = new KStor('myconfig', defaults);
// or new KStor({ /* options here */}, defaults);

// Getting a value.
// returns > 'app'
const name = store.get('name');

// Setting a value.
store.set('version', '1.0.1');

// Getting a nested value from indexed array.
// returns > 'notes'
const keyword = store.get('keywords[1]');

// Getting nested value from object.
const email = store.get('author.email');

// Check if has value.
// returns > true
const desc = store.has('description');
```

## Storage Paths

The storage path for your config is very flexible. Here are the majority of examples you might encounter.

**APP_NAME** denotes the directory name of your module or the package.json name of your module.
**HOME** denotes the home directory for your system. For example on mac /Users/YOUR_NAME.

<table>
  <tr><td>Name</td><td>Directory</td><td>Result</td></tr>
  <tr><td>undefined</td><td>undefined</td><td>/$HOME/.kstor/APP_NAME/config.json</td></tr>
  <tr><td>custom</td><td>undefined</td><td>/$HOME/.kstor/APP_NAME/custom.json</td></tr>
  <tr><td>.customrc</td><td>undefined</td><td>/$HOME/.kstor/APP_NAME/.customrc</td></tr>
  <tr><td>mydir/conf.json</td><td>undefined</td><td>/$HOME/.kstor/mydir/conf.json</td></tr>
  <tr><td>conf.json</td><td>./.configs</td><td>./.configs/conf.json (basically relative to local dir)</td></tr>
  <tr><td>conf.json</td><td>/absolute/path</td><td>/absolute/path/conf.json</td></tr>
</table>

## Options

For most use cases you will not need to set any options. By default the **"name"** and **"dir"** options are set automatically. When "dir" is specified the default directory is overriden.

By default configs are saved to **"$HOME/kstor/configs"**. The file name will be your specified **"name"** option or the name of the directory from which you instantiated.

### name

Filename when not specified is named as **your_directory_name.json**

<table>
  <tr><td>Type</td><td>String</td></tr>
  <tr><td>Default</td><td>null</td></tr>
</table>

### dir

Dir when not specified defaults to **$HOME/kstor/configs**

<table>
  <tr><td>Type</td><td>String</td></tr>
  <tr><td>Default</td><td>null</td></tr>
</table>

### entrypoint

When an entrypoint is specified the store is mapped to this key. There are use cases where this can be handy.

```ts
const defaults = {
  blogs: {
    blog1: { /* props here */ },
    blog2: { /* props here */ }
  }
}
const options = {
  entrypoint: 'blogs'
}
```

Which would result in your store essentially being the following data structure, allowing your gets and sets to ignore the top level **"blogs"** property key.

```ts
// Your store basically thinks or sees this even
// though the entire structure is still present.
const result = {
    blog1: { /* props here */ },
    blog2: { /* props here */ }
}
```

<table>
  <tr><td>Type</td><td>String</td></tr>
  <tr><td>Default</td><td>null</td></tr>
</table>

### encryptionKey

When an encryption key is specified it will encrypt your config. Since you are passing your encrypting key in plain text this doesn't secure the file however if the typical user were to open the config it deters them from making changes.

<table>
  <tr><td>Type</td><td>String</td></tr>
  <tr><td>Default</td><td>null</td></tr>
</table>

### transform

When data is loaded you can run the data through a transform which is useful for ensuring types. You must return a value.

```ts
// IMPORTANT: your data structure may be different!!

// Ensure date is of type Date.
const options2 = {
  transform: (k, v) => {
    for (const key in v) {
      if (key === 'date' && !(v[key] instanceof Date))
        v[key] = new Date(v[key]);
    }
    return v;
  }
}
```

<table>
  <tr><td>Arguments</td><td>(key: string, value: any)</td></tr>
  <tr><td>Returns</td><td>any</td></tr>
</table>

## API

### has

Checks if config has a given property.

<table>
  <tr><td>Arguments</td><td>(key: string)</td></tr>
  <tr><td>Returns</td><td>any</td></tr>
</table>

### get

Gets a value from the given by property path with optionally passing a default value to be set.

<table>
  <tr><td>Arguments</td><td>(key: string, def?: any)</td></tr>
  <tr><td>Returns</td><td>any</td></tr>
</table>

### set

Sets a value by property path or iterates an object setting each property.

<table>
  <tr><td>Arguments</td><td>(key: string | object, value?: any)</td></tr>
  <tr><td>Returns</td><td>KStor</td></tr>
</table>

### del

Deletes a key from the config.

<table>
  <tr><td>Arguments</td><td>(key: string)</td></tr>
  <tr><td>Returns</td><td>KStor</td></tr>
</table>

### clear

Clears the config to an empty object.

<table>
  <tr><td>Arguments</td><td>()</td></tr>
  <tr><td>Returns</td><td>KStor</td></tr>
</table>

### snapshot

Creates and returns a clone of your config.

<table>
  <tr><td>Arguments</td><td>()</td></tr>
  <tr><td>Returns</td><td>object</td></tr>
</table>

### db (get)

Gets the entire config using getter.

```ts
const data = this.db;
```

<table>
  <tr><td>Getter</td><td></td></tr>
  <tr><td>Returns</td><td>object</td></tr>
</table>

### db (set)

Sets the entire config using setter.

```ts
this.db = { /* your new object */ }
```

<table>
  <tr><td>Setter</td><td></td></tr>
  <tr><td>Returns</td><td>object</td></tr>
</table>

### size

Returns the size of the configuration.

```ts
const defaults = {
  name: 'app',
  description: 'My application description.',
  version: '1.0.0',
  keywords: [
    'todos',
    'notes',
    'messages'
  ],
  author: {
    name: 'Milton Waddams',
    email: 'mwaddams@mail.com'
  }
}

// In the above size would be 5
// as it counts only the top
// level keys.
const size = store.size;
```

<table>
  <tr><td>Getter</td><td></td></tr>
  <tr><td>Returns</td><td>number</td></tr>
</table>

### iterable

Gets an iterable instance for performing forEach etc... See: [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Iterators_and_Generators)

The **KStor** instance is also an iterable class, hence you can perform **for of** operations as well.

```ts
// Consider this data structure.
const teams = {
  jets: { city: 'New York' },
  eagles: { city: 'Philadelphia' },
  patriots: { city: 'New England' }
};

for(const item of store) {
  const key = item.key // this would be: jets, eagles, patriots.
  const value = item.value // would be each object ex: { city: 'New York' }
}

// OR
const iterator = [...store];

iterator.forEach(function(item) {
  // do something.
});
```

<table>
  <tr><td>Getter</td><td></td></tr>
  <tr><td>Returns</td><td>Iterable</td></tr>
</table>

## Docs

See [https://origin1tech.github.io/kstor/](https://origin1tech.github.io/kstor/)

## Change

See [CHANGE.md](CHANGE.md)

## License

See [LICENSE.md](LICENSE)
