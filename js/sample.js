/* Sample dataset: the American founding era. Loaded the first time the app opens
 * (and from Data → "Load sample data"). Everything here can be edited or deleted.
 */
window.SampleData = (() => {
  const P = {
    westmoreland: [38.11, -76.80], cambridge: [42.373, -71.110], newyork: [40.713, -74.006], trenton: [40.217, -74.743],
    valleyforge: [40.097, -75.459], yorktown: [37.238, -76.509], mtvernon: [38.708, -77.086], philadelphia: [39.953, -75.165],
    monticello: [38.010, -78.452], paris: [48.857, 2.352], dc: [38.895, -77.037], braintree: [42.253, -71.002],
    amsterdam: [52.370, 4.895], london: [51.507, -0.128], boston: [42.360, -71.059], weymouth: [42.221, -70.940],
    newkent: [37.50, -77.00], stpetersburg: [59.934, 30.335],
  };
  const pin = (date, key, label, note) => ({ date, lat: P[key][0], lng: P[key][1], label, note: note || '' });

  function create() {
    const cat = {
      person: 'cat_person', event: 'cat_event', document: 'cat_document', org: 'cat_org', territory: 'cat_territory', route: 'cat_route',
    };
    const lt = {
      parent: 'lt_parent', spouse: 'lt_spouse', signed: 'lt_signed', member: 'lt_member', present: 'lt_present',
      associate: 'lt_associate', ruled: 'lt_ruled', succeeded: 'lt_succeeded',
    };
    const src = { chernow: 'src_chernow', mccullough: 'src_mccullough', meacham: 'src_meacham', isaacson: 'src_isaacson', nara: 'src_nara' };
    const sources = [
      { id: src.chernow, title: 'Washington: A Life', author: 'Ron Chernow', year: '2010', where: 'Penguin Press', notes: 'Full biography.' },
      { id: src.mccullough, title: 'John Adams', author: 'David McCullough', year: '2001', where: 'Simon & Schuster', notes: '' },
      { id: src.meacham, title: 'Thomas Jefferson: The Art of Power', author: 'Jon Meacham', year: '2012', where: 'Random House', notes: '' },
      { id: src.isaacson, title: 'Benjamin Franklin: An American Life', author: 'Walter Isaacson', year: '2003', where: 'Simon & Schuster', notes: '' },
      { id: src.nara, title: 'Declaration of Independence: A Transcription', author: 'U.S. National Archives', year: '', where: 'https://www.archives.gov/founding-docs/declaration-transcript', notes: 'Primary source. Lists the signers by state.' },
    ];
    const categories = [
      { id: cat.person, name: 'Person', color: '#4f8cff', icon: '👤', fields: ['Born/Date', 'Born/Place', 'Died/Date', 'Died/Place', 'Occupation', 'Nationality'] },
      { id: cat.event, name: 'Event', color: '#f39c12', icon: '⚡', fields: ['Outcome'] },
      { id: cat.document, name: 'Document', color: '#1abc9c', icon: '📜', fields: ['Author', 'Adopted'], sourceId: src.nara },
      { id: cat.org, name: 'Organization', color: '#27ae60', icon: '🏛️', fields: ['Founded', 'Dissolved'] },
      { id: cat.territory, name: 'Territory / border', color: '#c0392b', icon: '🗺️', fields: ['Ruler'], defaultKind: 'area' },
      { id: cat.route, name: 'Route', color: '#8e44ad', icon: '➡️', fields: [], defaultKind: 'path' },
    ];
    const linkTypes = [
      { id: lt.parent, name: 'Parent of', color: '#e67e22', directed: true, fromLabel: 'parent', toLabel: 'child', topSide: 'from' },
      { id: lt.spouse, name: 'Spouse of', color: '#e84393', directed: false },
      { id: lt.signed, name: 'Signed by', color: '#1abc9c', directed: true, fromLabel: 'document', toLabel: 'signatory', topSide: 'from' },
      { id: lt.member, name: 'Member of', color: '#27ae60', directed: true, fromLabel: 'member', toLabel: 'organization', topSide: 'to' },
      { id: lt.present, name: 'Present at', color: '#9b59b6', directed: true, fromLabel: 'participant', toLabel: 'event', topSide: 'to' },
      { id: lt.associate, name: 'Associate of', color: '#95a5a6', directed: false },
      { id: lt.ruled, name: 'Ruled by', color: '#c0392b', directed: true, fromLabel: 'territory', toLabel: 'ruler', topSide: 'to' },
      { id: lt.succeeded, name: 'Succeeded by', color: '#f1c40f', directed: true, fromLabel: 'predecessor', toLabel: 'successor', topSide: 'from' },
    ];

    const markers = [
      { id: 'm_washington', name: 'George Washington', categoryId: cat.person, start: '1732-02-22', startLabel: 'Born', end: '1799-12-14', endLabel: 'Died',
        summary: 'Commander of the Continental Army; first President of the United States.',
        fields: { 'Born/Date': '22 Feb 1732', 'Born/Place': 'Westmoreland County, Virginia', 'Died/Date': '14 Dec 1799', 'Died/Place': 'Mount Vernon', Occupation: 'Planter, general, president', Nationality: 'American' },
        fieldSources: { 'Born/Date': { sourceId: src.chernow, page: 'ch. 1' }, 'Born/Place': { sourceId: src.chernow, page: 'ch. 1' } },
        description: 'Did NOT sign the Declaration of Independence – he was in New York with the army in July 1776.\nPresident 1789–1797.',
        tags: ['founding father', 'president'], citations: [{ sourceId: src.chernow, page: '', note: 'Main source for dates and movements' }],
        moves: [pin('', 'westmoreland', 'Westmoreland County, VA', 'Birthplace'), pin('1759-01', 'mtvernon', 'Mount Vernon'),
          Object.assign(pin('1775-07-03', 'cambridge', 'Cambridge, MA', 'Takes command of the Continental Army'), { sourceId: src.chernow, page: 'ch. 17' }), pin('1776-08', 'newyork', 'New York'),
          pin('1776-12-25', 'trenton', 'Trenton, NJ', 'Crossing of the Delaware'), pin('1777-12-19', 'valleyforge', 'Valley Forge'),
          pin('1781-09-28', 'yorktown', 'Yorktown, VA'), pin('1783-12-24', 'mtvernon', 'Mount Vernon', 'Resigns his commission'),
          pin('1789-04-30', 'newyork', 'New York', 'Inaugurated as President'), pin('1790-12', 'philadelphia', 'Philadelphia', 'Capital moves'),
          pin('1797-03-04', 'mtvernon', 'Mount Vernon', 'Retires')] },
      { id: 'm_jefferson', name: 'Thomas Jefferson', categoryId: cat.person, start: '1743-04-13', startLabel: 'Born', end: '1826-07-04', endLabel: 'Died',
        summary: 'Principal author of the Declaration of Independence; third President.',
        fields: { 'Born/Date': '13 Apr 1743', 'Born/Place': 'Shadwell, Virginia', 'Died/Date': '4 Jul 1826', 'Died/Place': 'Monticello', Occupation: 'Lawyer, statesman, president', Nationality: 'American' },
        description: 'Drafted the Declaration in Philadelphia in June 1776.\nMinister to France 1785–1789. President 1801–1809.\nDied the same day as John Adams, 50 years to the day after the Declaration was adopted.',
        tags: ['founding father', 'president'], citations: [{ sourceId: src.meacham, page: '', note: '' }],
        moves: [pin('', 'monticello', 'Shadwell / Monticello, VA'), pin('1775-06-20', 'philadelphia', 'Philadelphia', 'Joins the Continental Congress'),
          pin('1776-09-03', 'monticello', 'Monticello'), pin('1784-08-06', 'paris', 'Paris', 'Arrives as minister to France'),
          pin('1789-11-23', 'monticello', 'Monticello'), pin('1801-03-04', 'dc', 'Washington, D.C.', 'Inaugurated as President'),
          pin('1809-03-04', 'monticello', 'Monticello', 'Retires')] },
      { id: 'm_adams', name: 'John Adams', categoryId: cat.person, start: '1735-10-30', startLabel: 'Born', end: '1826-07-04', endLabel: 'Died',
        summary: 'Advocate of independence in Congress; diplomat; second President.',
        fields: { 'Born/Date': '30 Oct 1735', 'Born/Place': 'Braintree, Massachusetts', 'Died/Date': '4 Jul 1826', 'Died/Place': 'Quincy', Occupation: 'Lawyer, diplomat, president', Nationality: 'American' },
        description: 'Pushed Congress toward independence in 1776 and chose Jefferson to draft the Declaration.\nNegotiated the Treaty of Paris (1783). President 1797–1801.',
        tags: ['founding father', 'president'], citations: [{ sourceId: src.mccullough, page: '', note: '' }],
        moves: [pin('', 'braintree', 'Braintree, MA'), pin('1774-09', 'philadelphia', 'Philadelphia', 'First Continental Congress'),
          pin('1778-04-08', 'paris', 'Paris', 'Commissioner to France'), pin('1779-08-02', 'braintree', 'Braintree'),
          pin('1780-08', 'amsterdam', 'Amsterdam', 'Secures Dutch loans'), pin('1785-05', 'london', 'London', 'First U.S. minister to Britain'),
          pin('1788-06', 'braintree', 'Braintree'), pin('1797-03-04', 'philadelphia', 'Philadelphia', 'Inaugurated as President'),
          pin('1800-11-01', 'dc', 'Washington, D.C.', 'First president in the White House'), pin('1801-03-04', 'braintree', 'Quincy', 'Retires')] },
      { id: 'm_franklin', name: 'Benjamin Franklin', categoryId: cat.person, start: '1706-01-17', startLabel: 'Born', end: '1790-04-17', endLabel: 'Died',
        summary: 'Printer, scientist, diplomat; oldest signer of the Declaration.',
        fields: { 'Born/Date': '17 Jan 1706', 'Born/Place': 'Boston', 'Died/Date': '17 Apr 1790', 'Died/Place': 'Philadelphia', Occupation: 'Printer, scientist, diplomat', Nationality: 'American' },
        description: 'Edited Jefferson\'s draft of the Declaration.\nMinister to France 1776–1785; secured the French alliance of 1778.',
        tags: ['founding father'], citations: [{ sourceId: src.isaacson, page: '', note: '' }],
        moves: [pin('', 'boston', 'Boston'), pin('1723-10', 'philadelphia', 'Philadelphia'), pin('1757-07', 'london', 'London', 'Colonial agent'),
          pin('1775-05-05', 'philadelphia', 'Philadelphia'), pin('1776-12-21', 'paris', 'Paris (Passy)', 'Arrives in France'), pin('1785-09-14', 'philadelphia', 'Philadelphia')] },
      { id: 'm_hancock', name: 'John Hancock', categoryId: cat.person, start: '1737-01-23', startLabel: 'Born', end: '1793-10-08', endLabel: 'Died',
        summary: 'President of the Continental Congress; famous large signature.',
        fields: { 'Born/Date': '23 Jan 1737', 'Born/Place': 'Braintree', 'Died/Date': '8 Oct 1793', 'Died/Place': 'Quincy', Occupation: 'Merchant, politician', Nationality: 'American' },
        tags: ['founding father'],
        moves: [pin('', 'braintree', 'Braintree, MA'), pin('1745', 'boston', 'Boston'), pin('1775-05-10', 'philadelphia', 'Philadelphia'), pin('1780-10', 'boston', 'Boston', 'Governor of Massachusetts')] },
      { id: 'm_abigail', name: 'Abigail Adams', categoryId: cat.person, start: '1744-11-22', startLabel: 'Born', end: '1818-10-28', endLabel: 'Died',
        summary: 'Writer and adviser; wife of John Adams, mother of John Quincy Adams.',
        fields: { 'Born/Date': '22 Nov 1744', 'Born/Place': 'Weymouth, Massachusetts', 'Died/Date': '28 Oct 1818', 'Died/Place': 'Quincy', Nationality: 'American' },
        description: '"Remember the ladies" letter to John, 31 March 1776.',
        moves: [pin('', 'weymouth', 'Weymouth, MA'), pin('1764-10-25', 'braintree', 'Braintree', 'Marries John Adams'),
          pin('1784-08', 'paris', 'Paris (Auteuil)'), pin('1785-05', 'london', 'London'), pin('1788-06', 'braintree', 'Braintree')] },
      { id: 'm_jqadams', name: 'John Quincy Adams', categoryId: cat.person, start: '1767-07-11', startLabel: 'Born', end: '1848-02-23', endLabel: 'Died',
        summary: 'Diplomat and sixth President; son of John and Abigail Adams.',
        fields: { 'Born/Date': '11 Jul 1767', 'Born/Place': 'Braintree', 'Died/Date': '23 Feb 1848', 'Died/Place': 'Washington, D.C.', Occupation: 'Diplomat, president', Nationality: 'American' },
        moves: [pin('', 'braintree', 'Braintree, MA'), pin('1778-04-08', 'paris', 'Paris', 'With his father'), pin('1781-08', 'stpetersburg', 'St. Petersburg', 'Secretary to the U.S. envoy to Russia'),
          pin('1785-07', 'braintree', 'Braintree / Harvard'), pin('1825-03-04', 'dc', 'Washington, D.C.', 'Inaugurated as President')] },
      { id: 'm_martha', name: 'Martha Washington', categoryId: cat.person, start: '1731-06-13', startLabel: 'Born', end: '1802-05-22', endLabel: 'Died',
        summary: 'First First Lady of the United States.',
        moves: [pin('', 'newkent', 'New Kent County, VA'), pin('1759-01-06', 'mtvernon', 'Mount Vernon', 'Marries George Washington')] },
      { id: 'm_george3', name: 'George III', categoryId: cat.person, start: '1738-06-04', startLabel: 'Born', end: '1820-01-29', endLabel: 'Died',
        summary: 'King of Great Britain during the American Revolution.',
        fields: { 'Born/Date': '4 Jun 1738', 'Born/Place': 'London', 'Died/Date': '29 Jan 1820', 'Died/Place': 'Windsor', Occupation: 'Monarch', Nationality: 'British' },
        moves: [pin('', 'london', 'London')] },

      { id: 'm_declaration', name: 'Declaration of Independence', categoryId: cat.document, start: '1776-07-04', startLabel: 'Adopted',
        summary: 'Adopted by the Second Continental Congress on 4 July 1776.',
        fields: { Author: 'Thomas Jefferson (drafter); Committee of Five', Adopted: '4 July 1776' },
        description: 'Most delegates signed the engrossed copy on 2 August 1776, not 4 July.\nUse the Ties tab with tie type "Signed by" and this marker as hub to see the signers.',
        moves: [pin('1776-07-04', 'philadelphia', 'Philadelphia, Independence Hall')] },
      { id: 'm_congress', name: 'Second Continental Congress', categoryId: cat.org, start: '1775-05-10', startLabel: 'Convened', end: '1781-03-01', endLabel: 'Replaced by Congress of the Confederation',
        summary: 'Governing body of the colonies during the Revolution.',
        fields: { Founded: '10 May 1775', Dissolved: '1 March 1781' },
        moves: [pin('1775-05-10', 'philadelphia', 'Philadelphia'), { date: '1776-12-20', lat: 39.290, lng: -76.612, label: 'Baltimore', note: 'Flees Philadelphia ahead of the British' }, pin('1777-03-05', 'philadelphia', 'Philadelphia')] },
      { id: 'm_yorktown', name: 'Siege of Yorktown', categoryId: cat.event, start: '1781-09-28', startLabel: 'Began', end: '1781-10-19', endLabel: 'Surrender',
        summary: 'Last major land battle of the Revolutionary War.',
        fields: { Outcome: 'British surrender under Cornwallis' },
        moves: [pin('1781-09-28', 'yorktown', 'Yorktown, Virginia')] },
      { id: 'm_lexington', name: 'Battles of Lexington and Concord', categoryId: cat.event, start: '1775-04-19', startLabel: 'Fought', end: '1775-04-19',
        summary: 'First military engagements of the Revolutionary War.',
        fields: { Outcome: 'British retreat to Boston' },
        moves: [{ date: '1775-04-19', lat: 42.447, lng: -71.226, label: 'Lexington, Massachusetts' }] },

      { id: 'm_colonies', name: 'United States (claimed territory)', kind: 'area', categoryId: cat.territory, start: '1776-07-04', startLabel: 'Declared',
        summary: 'Rough outline: the Thirteen Colonies in 1776, expanded to the Mississippi by the 1783 Treaty of Paris.',
        description: 'Borders are approximate sketches for demonstration – redraw them with real data.',
        moves: [
          { date: '1776-07-04', label: 'Thirteen Colonies', coords: [[45.0, -67.0], [47.3, -69.2], [45.3, -71.5], [45.0, -73.3], [43.0, -73.5], [42.0, -79.8], [39.7, -80.5], [36.6, -81.7], [35.0, -84.3], [30.7, -85.0], [30.7, -81.5], [32.0, -80.9], [33.9, -78.0], [35.2, -75.5], [37.0, -75.9], [39.0, -74.9], [40.5, -74.0], [41.2, -71.8], [41.5, -70.0], [42.6, -70.6], [43.8, -69.8], [44.8, -66.9]] },
          { date: '1783-09-03', label: 'After the Treaty of Paris', note: 'Western border moves to the Mississippi', coords: [[45.0, -67.0], [47.3, -69.2], [45.0, -71.5], [45.0, -74.7], [44.0, -76.5], [43.3, -79.0], [42.3, -81.5], [41.7, -83.0], [45.5, -84.0], [46.5, -84.5], [48.0, -89.5], [49.0, -95.0], [47.5, -95.0], [44.5, -93.0], [42.0, -91.0], [38.5, -90.2], [36.0, -89.5], [32.5, -91.2], [31.0, -91.5], [31.0, -85.0], [30.7, -81.5], [32.0, -80.9], [33.9, -78.0], [35.2, -75.5], [37.0, -75.9], [39.0, -74.9], [40.5, -74.0], [41.2, -71.8], [41.5, -70.0], [42.6, -70.6], [43.8, -69.8], [44.8, -66.9]] },
        ] },
      { id: 'm_route', name: "Washington's campaign route", kind: 'path', categoryId: cat.route, start: '1775-07-03',
        summary: 'Grows as the war progresses: Cambridge → New York → Trenton → Valley Forge → Yorktown.',
        moves: [
          { date: '1775-07-03', label: 'Cambridge', coords: [P.cambridge] },
          { date: '1776-08', label: 'to New York', coords: [P.cambridge, P.newyork] },
          { date: '1776-12-25', label: 'to Trenton', coords: [P.cambridge, P.newyork, P.trenton] },
          { date: '1777-12-19', label: 'to Valley Forge', coords: [P.cambridge, P.newyork, P.trenton, P.valleyforge] },
          { date: '1781-09-28', label: 'to Yorktown', coords: [P.cambridge, P.newyork, P.trenton, P.valleyforge, P.yorktown] },
        ] },
    ];

    const L = (typeId, fromId, toId, extra) => Object.assign({ typeId, fromId, toId }, extra || {});
    const links = [
      L(lt.signed, 'm_declaration', 'm_jefferson', { start: '1776-08-02', note: 'Drafted the text' }),
      L(lt.signed, 'm_declaration', 'm_adams', { start: '1776-08-02' }),
      L(lt.signed, 'm_declaration', 'm_franklin', { start: '1776-08-02' }),
      L(lt.signed, 'm_declaration', 'm_hancock', { start: '1776-07-04', note: 'Signed first, as President of Congress', sourceId: src.nara }),
      L(lt.member, 'm_washington', 'm_congress', { start: '1775-05-10', end: '1775-06-15', note: 'Left to command the army' }),
      L(lt.member, 'm_jefferson', 'm_congress', { start: '1775-06-20', end: '1776-09-02' }),
      L(lt.member, 'm_adams', 'm_congress', { start: '1775-05-10', end: '1777-11-11' }),
      L(lt.member, 'm_franklin', 'm_congress', { start: '1775-05-10', end: '1776-10-26' }),
      L(lt.member, 'm_hancock', 'm_congress', { start: '1775-05-10', end: '1777-10-29', label: 'President of Congress' }),
      L(lt.present, 'm_washington', 'm_yorktown'),
      L(lt.spouse, 'm_adams', 'm_abigail', { start: '1764-10-25' }),
      L(lt.parent, 'm_adams', 'm_jqadams'),
      L(lt.parent, 'm_abigail', 'm_jqadams'),
      L(lt.spouse, 'm_washington', 'm_martha', { start: '1759-01-06' }),
      L(lt.ruled, 'm_colonies', 'm_george3', { end: '1776-07-04', note: 'Claimed by the Crown until independence was declared' }),
      L(lt.succeeded, 'm_washington', 'm_adams', { start: '1797-03-04', label: 'as President' }),
      L(lt.succeeded, 'm_adams', 'm_jefferson', { start: '1801-03-04', label: 'as President' }),
      L(lt.associate, 'm_jefferson', 'm_adams', { note: 'Friends, then rivals, then correspondents again from 1812' }),
      L(lt.associate, 'm_franklin', 'm_jefferson', { start: '1784-08', end: '1785-07', note: 'Both in Paris' }),
      L(lt.present, 'm_adams', 'm_declaration', { note: 'Committee of Five' }),
      L(lt.present, 'm_franklin', 'm_declaration', { note: 'Committee of Five' }),
    ];
    links.forEach((l, i) => { l.id = 'l_' + i; });
    markers.forEach(m => m.moves.forEach((mv, i) => { mv.id = m.id + '_mv' + i; }));

    return { version: 1, categories, linkTypes, markers, links, sources };
  }
  return { create };
})();
