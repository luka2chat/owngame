using System;

namespace StarLetters
{
    public enum HomeStage { ReadLetter, TendFlower, FindPart, RepairBeacon, Ready }
    public enum HomeAction { Mailbox, Flower, Toolbox, Beacon }

    // Story rules are independent of scene objects and input, so repeated or early
    // interaction cannot skip progress. A later save system can serialize this stage.
    [Serializable]
    public sealed class HomeQuest
    {
        public HomeStage Stage { get; private set; } = HomeStage.ReadLetter;
        public bool Apply(HomeAction action)
        {
            bool allowed =
                (Stage == HomeStage.ReadLetter && action == HomeAction.Mailbox) ||
                (Stage == HomeStage.TendFlower && action == HomeAction.Flower) ||
                (Stage == HomeStage.FindPart && action == HomeAction.Toolbox) ||
                (Stage == HomeStage.RepairBeacon && action == HomeAction.Beacon);
            if (allowed) Stage = (HomeStage)((int)Stage + 1);
            return allowed;
        }
        public void Reset() => Stage = HomeStage.ReadLetter;
    }
}
