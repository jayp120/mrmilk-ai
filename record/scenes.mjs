// What the browser does during each narration segment.
// `d` is that segment's audio duration in seconds — paced() spreads the steps
// across it so picture and voice always land together.
export default {
  // The problem: density. Open on the map so "one customer per building" is
  // something you can see, not just hear.
  's01-problem': async (page, h, d) => {
    await h.tab('Delivery Map');
    await h.paced(d * 0.92, [
      async () => { await h.caption('Referral Engine', 'Mr. Milk AI OS'); },
      async () => { await h.caption('The problem', '9 in 10 buildings have exactly ONE customer'); },
      async () => { await h.scrollY(320); },
      async () => { await h.caption('Every delivery, one flat', 'Worst economics in the operation'); },
    ]);
  },

  // The flip side: the boy is already there. Show the referral tab's own
  // explanation panel, which says exactly this in writing.
  's02-solution': async (page, h, d) => {
    await h.top();
    await h.tab('Referrals');
    await h.paced(d * 0.92, [
      async () => { await h.caption('The opportunity', 'The delivery boy is already at that door'); },
      async () => { await h.scrollY(150); },
      async () => { await h.caption('No new travel', 'No new stop on the route'); },
      async () => { await h.scrollY(180); },
      async () => { await h.caption('The cheapest growth we have', ''); },
    ]);
  },

  // The list, then a real customer opened up.
  's03-walkthrough': async (page, h, d) => {
    await h.top();
    await h.paced(d * 0.93, [
      async () => { await h.caption('1,146 opportunities', 'Ranked — strongest first'); },
      async () => { await h.scrollTo('Call list'); },
      async () => { await h.caption('Tejashri Shinde', '774 deliveries over 16 months'); },
      async () => { await h.clickRow(0); },
      async () => { await h.scrollTo('Already on this doorstep'); },
      async () => { await h.caption('Samarth Bhosale is already there', 'Every single morning'); },
      async () => { await h.scrollTo('What to say'); await h.caption('A ready pitch', 'Built from their real history'); },
    ]);
  },

  // Why the list can be trusted — the exclusion panel.
  's04-trust': async (page, h, d) => {
    await h.top();
    await h.paced(d * 0.92, [
      async () => { await h.caption('Can we trust this list?', ''); },
      async () => { await h.scrollTo('left out of this list on purpose'); },
      async () => { await h.caption('1,155 customers excluded', 'Their location did not check out'); },
      async () => { await h.caption('A short correct list', 'beats a long unreliable one'); },
    ]);
  },

  // What BD actually does with it.
  's05-business': async (page, h, d) => {
    await h.top();
    await h.paced(d * 0.93, [
      async () => { await h.caption('For the business development team', ''); },
      async () => { await h.scrollTo('Call list'); },
      async () => { await h.caption('Name · Mobile · Address · Delivery boy', 'Every row is a complete action'); },
      async () => { await h.clickRow(1); },
      async () => { await h.caption('Export to Excel', 'Hand it straight to the field team'); },
      async () => { await h.top(); await h.caption('Rs 7,000 average per new customer', '100 conversions = Rs 7 lakh'); },
    ]);
  },
};
