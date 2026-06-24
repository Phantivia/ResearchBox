ResearchBox Agent功能整体目标：

 - Agent Chat实现了BuildResearchAgent中的五项基本功能，成为ResearchBox的使用主界面。

ResaerchBox Agent用户侧设计：

 - Agent Chat成为平行于功能、设置的第三个大项，在侧边栏展示
 - 它的展开子菜单的开头fixed展示产出的artifaces,下面的变长部分显示对话历史，最下方有一个搜索历史对话功能入口
 - 还原一般网页AI服务的常见用户侧体验：显示思考内容、工具调用、用户approval等基本用户体验内容

分阶段里程碑预想：

 - 先实现一个基本的chat功能，不包含任何工具调用。支持以美观的方式显示思维内容，用户和模型的对话等基本内容。另外，支持实时查看上下文大小的功能。
 - 然后实现基本的agent loop，支持一个工具：PaperBox Read。
 - 完善其他工具和优化...