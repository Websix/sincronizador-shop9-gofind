import db from '../database';
export default function handle(event, {action, args}) {
  switch (action) {
    case 'configs.get':
      db.configs.get(args)
        .then(rows => {
          event.reply('database-reply', rows);
        })
        .catch(err => {
          event.reply('database-reply', err);
        });
      break;
    case 'configs.all':
      db.configs.all()
        .then(rows => {
          event.reply('database-reply', rows);
        })
        .catch(err => {
          event.reply('database-reply', err);
        });
      break;
    case 'configs.save':
      db.configs.save(args)
        .then(() => {
          event.reply('database-reply', null);
        })
        .catch(err => {
          event.reply('database-reply', err);
        })
      break;
    default:
      event.reply('database-reply', new Error('Invalid event!'));
  }
}
