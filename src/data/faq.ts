export interface FaqGroup {
  title: string;
  items: { q: string; a: string }[];
}

export const FAQ: FaqGroup[] = [
  {
    title: 'Configurator and quote',
    items: [
      {
        q: 'Is the price in the configurator final?',
        a: 'It is calculated from the actual parts of your piece (wood volume, workshop time, finish, delivery), so it is close. After your request we check the drawing by hand and send a fixed quote within two working days. On this demo site all prices are invented.',
      },
      {
        q: 'Why does the configurator refuse some combinations?',
        a: 'Because we would refuse to build them. The configurator calculates how much a top or shelf sags under load, based on the stiffness of the wood you chose. A thin top over a long span or a pine shelf over 1.20 m would sag visibly, so you get a warning or, if it is clearly too weak, a block with a concrete suggestion how to fix it.',
      },
      {
        q: 'How do I save or share my design?',
        a: 'Everything you choose is stored in the page address. Use "Copy link" and send it by email or messenger; whoever opens it sees exactly your configuration, including the room settings. You can also download a PDF quote or a snapshot image.',
      },
      {
        q: 'Can I compare two versions?',
        a: 'Yes. "Compare with a variant" copies your design as variant B. Change B, and you see both side by side in the same 3D scene (at the same scale) plus a table of all differences and both prices. On a phone you switch between A and B with one tap.',
      },
      {
        q: 'What is the GLB file for?',
        a: 'GLB is a standard 3D format. Interior designers and architects can drop it into their planning software, and many 3D viewers open it directly. It contains the piece with its wood textures in real-world size.',
      },
      {
        q: 'The 3D view doesn’t load. What can I do?',
        a: 'The 3D view needs WebGL, which almost every current browser supports. If it is switched off (some company laptops do that), the configurator still works: you can set all options, see the price and request a quote; you just won’t see the model.',
      },
    ],
  },
  {
    title: 'Wood, build and care',
    items: [
      {
        q: 'Is it really solid wood?',
        a: 'Yes. Tops, legs, frames and shelves are solid wood, glued from narrow boards so they stay flat. The only exception are drawer bottoms, which are made of birch plywood because solid wood would swell and jam.',
      },
      {
        q: 'Will my table look exactly like the 3D view?',
        a: 'The proportions, the edge profile and the color range will. The grain in the configurator is generated to look typical for the species; your boards will have their own figure. You are welcome to choose the boards with us in the workshop.',
      },
      {
        q: 'Oil or lacquer?',
        a: 'Oil feels like wood and can be repaired locally, but wants a fresh coat every one to two years on a dining table. Matte lacquer protects better against water rings and needs almost no care. For tables used by families with small children we usually recommend lacquer.',
      },
      {
        q: 'Where does the wood come from?',
        a: 'Oak, beech, ash and pine come from sawmills in Brandenburg, Saxony and Scandinavia with PEFC or FSC certification. Walnut comes from North America, because European walnut in table sizes is very rare.',
      },
    ],
  },
  {
    title: 'Delivery and payment',
    items: [
      {
        q: 'How long does it take?',
        a: 'Depending on the piece, four to nine weeks after your deposit. The configurator shows the typical lead time of each piece in the review step. All lead times on this site are demo values.',
      },
      {
        q: 'What does delivery cost?',
        a: 'Pickup in the workshop is free. Within Berlin we deliver and set up for a flat €59 net, anywhere else in Germany for €179 net. Pieces over 60 kg or longer than 2.20 m need two people to carry: +€70 net. We don’t ship outside Germany.',
      },
      {
        q: 'How do I pay?',
        a: '30 % deposit when you order, the rest on delivery, by bank transfer. No payment is taken online.',
      },
      {
        q: 'Can I return a made-to-measure piece?',
        a: 'Furniture made to your specifications is excluded from the 14-day right of withdrawal under German law. That is why we send a drawing with the quote and only start once you have confirmed it. Of course the statutory two-year warranty applies.',
      },
    ],
  },
];
