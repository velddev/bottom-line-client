TradeMMO 1.0 Design document

one core production chain (needs to be extendable):
- Food: comes from grain and meat, requires a factory, can be sold to citizen
- Leather: comes from cattle (1 cattle produces 1-3 leather), requires a factory
- Meat: comes from cattle (1 cattle produces 10 meat), requires a factory
- Cattle: consumes feed and reproduces slowly (10 feed for 1 cattle), requires a field
- Animal Feed: comes from grain, requires a factory
- Grain: requires field and water
- Water: sold by government

building types:
- store: sells sellable resources to citizen
- factory: crafts item into another item
- field: crop field, or otherwise. Could be planted with certain resource
- warehouse: store items across large distances for quick re-sale

game mechanics:
- final products:
  items that can be sold can be branded by the factory, or white-labeled by the selling shop. If an item is white-labeled, it keeps the quality, but loses all brand power, the shop has to

- trade agreements:
  players are able to either keep their outputs (e.g. factory) private and only sell to their other structures, or public, and anyone can buy from it. A player should be able to set a specific trade agreement with another player to sell at a discount with any of the following requirements:
    - non-competition: the buying player is not allowed to buy resources from other vendors
    - require msrp price (set by creator player): the buying player needs to re-sell the item (e.g. restaurant) at price set by agreement.
    - disallow white-labeling: the buying player cannot re-sell the item under its own brand.

- research:
  every resource produced has a quality level, this quality level determines the base demand from citizen. The baseline is always the median of all items on the market right now, if you are below the baseline your items receive a demand penalty of up to 20%, for each point you logarithmically get higher demand points, which scores how much your item would sell (up to 100% of the market).

- marketing:
  every player can set up marketing for their branded items, marketing costs money and employees. The better employees you can find or train, the better the marketing campaigns will progess, and the higher brand value you get. If you stop marketing for a while, brand value goes down. Brand value is a share of the total brands in this category PER city. This means if you have no competition, only government brand items will compete with you, you won't have to worry about that.

- supply & demand:
  even if you have the best and most marketed items, you cannot just set the sale price to 10x the value. This will very quickly destroy your final value. If someone is able to undercut you, then people will quickly change up based on the city overall economics. (determined by how much tax is being collected).

- exporting & importing:
  you can buy items from the port that may not be available in your city, but this is always a government-made item and cannot be improved upon, if you use it in your high research factory, it will give you a penalty since it lowers the source materials.

  exporting is possible, but delivers less money than what may be able to be profited from in the city

- politics:
  cities have governments, and the government is by default ran by AI. This means you do not have control over anything yet, every 4 in-game years an election is ran, which players can sign up for. Based on their public perception, they may be chosen to run for office and citizen will vote.

  the government controls several key points:
    1. consumer tax rate per resource type
    2. profit tax rate
    3. land tax rate per building
    4. employee tax rate

  as a player you can use this to your advantage as a comeback mechanic since you can control how the overall environment will play as. You could destroy the GDP effectively ruining the city.

  politicians have approval rate based on three categories: city, people, and business. These values are determined based on how well you perform during your time in office, based on that your votes will be tougher if you did badly.


---

Tech stack:

The game is played as an API, any player builds their own agent to create the UI or automate it by AI, which is allowed.

the current api is a GRPC api which has an event stream for everything happening, which the player can open.

The game has a tick rate of 1 tick per minute, each tick is an in-game day. each year is always 365 days.